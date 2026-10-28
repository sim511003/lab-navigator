// Lab Navigator AI 서버 함수 (Vercel + Google Gemini 무료 API)
// - API 키는 Vercel 환경변수 GEMINI_API_KEY에만 저장하고, 브라우저로는 절대 보내지 않음
// - 브라우저는 { kind, text }만 보내고, 프롬프트는 여기서 만들어서 다른 용도로 쓰지 못하게 막음

// 모델 이름은 자주 바뀜. Google AI Studio의 무료 모델 이름으로 GEMINI_MODEL 환경변수를 바꿔 쓰면 됨
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_INPUT = 12000;              // 붙여넣기 최대 글자 수
const LIMIT_PER_WINDOW = 10;          // IP당 요청 수
const WINDOW_MS = 10 * 60 * 1000;     // 10분
const hits = new Map();               // 간단한 IP별 요청 제한 (서버가 재시작되면 초기화됨)

const OPS_DOC = [
  "mix = 교반·용해", "heat_open = 개방 가열·환류", "heat_closed = 밀폐 가열 (100 ℃ 이하)",
  "heat_pressure = 가압 수열·용매열", "microwave = 마이크로웨이브 가열", "calcine = 소성·열처리",
  "dry = 건조", "vacuum_dry = 진공 건조", "freeze = 동결", "mill = 분쇄·볼밀", "coat = 코팅",
  "separate = 원심·분리", "clean = 기판 세척", "purge = 불활성 가스 퍼지", "inert_handle = 글로브박스 취급",
  "seal = 셀 밀봉", "deposit = 전기증착·전기화학", "vacuum_depo = 진공 증착·스퍼터"
].join("\n");

const SCHEMA = '{"field":"분야 (예: 태양전지·광촉매, 이차전지, 고분자, 촉매, 바이오소재 등 한국어 짧게)","target":"만드는 물질·소자 이름 (한국어+화학식)","title":"방법 이름 (짧게)","method":"방법 분류 한 단어","out":"보고된/예상 결과 한 줄 (크기·상·성능 등)","cost":"시약·소모품 대략 비용, 천원 단위 숫자","days":"전체 소요 일수 숫자",' +
  '"steps":["실험 절차 3~6단계, 한국어"],' +
  '"ops":[{"op":"아래 공정 코드 중 하나","T":"온도 ℃ 숫자 또는 null","atm":"air|Ar|N2|vacuum 또는 null","what":"이 단계가 하는 일 한국어 짧게","prefer":"특정 장비가 꼭 필요하면 장비 id(hotplate, oilbath, waterbath, oven, vacuumoven, muffle, tube, autoclave, microwave, freezer, ballmill, spin, doctorblade, ultrasonic, centrifuge, n2line, glovebox, crimper, potentiostat, sputter) 아니면 null"}],' +
  '"reagents":[{"name":"시약 이름 (화학식 또는 흔한 약어)","hazard":["fume|toxic_inhal|sensitizer|corrosive|flammable|water_reactive 중 해당하는 것"],"subs":[{"name":"대체 가능한 시약","note":"대체 시 주의점 한국어 한 줄","pen":"신뢰도 감점 0.03~0.2"}]}],' +
  '"missing":["재현에 필요한데 빠진 조건 (승온 속도, 충전율, 교반 속도 등) 한국어"]}';

const RULES = "공정 코드 목록:\n" + OPS_DOC + "\n\n규칙:\n- 물은 시약 목록에 넣지 않음.\n- 용매 끓는점보다 높은 온도의 밀폐 반응은 heat_pressure, 100 ℃ 이하 밀폐는 heat_closed.\n- 소성에 불활성 분위기가 필요하면 atm에 반드시 표시.\n- 공기·수분에 민감한 물질을 다루는 단계는 inert_handle 공정을 넣음.\n- 확실하지 않은 값은 지어내지 말고 null로 두고 missing에 적음.\n- 모든 텍스트는 한국어.\n- 답은 JSON만 쓰고 다른 설명은 붙이지 않음.";

function buildPrompt(kind, text) {
  if (kind === "ai") {
    return "화학 실험 계획을 돕는 역할임. 아래 물질을 실험실에서 만드는 대표적인 방법 3가지를 서로 다른 방식으로 골라, 각 방법을 아래 JSON 객체 형식으로 정리해 JSON 배열 하나로만 답함.\n\n물질: " + text +
      "\n\n객체 형식:\n" + SCHEMA + "\n\n" + RULES + "\n- 문헌에서 흔히 쓰이는 일반적 조건으로 쓰고, target은 세 방법 모두 같은 이름으로 씀.";
  }
  return "화학 논문의 실험 절차를 구조화하는 역할임. 아래 절차를 읽고 아래 JSON 객체 하나로만 답함. 절차에 없는 값은 지어내지 말고 null로 둠. 대체 시약(subs)은 일반 화학 지식으로 제안해도 됨.\n\n객체 형식:\n" +
    SCHEMA + "\n\n" + RULES + "\n\n실험 절차:\n" + text;
}

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  const KEY = process.env.GEMINI_API_KEY;
  // 연결 확인용
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, configured: Boolean(KEY), model: MODEL });
  }
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  if (!KEY) return res.status(503).json({ code: "not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const kind = body && body.kind === "ai" ? "ai" : body && body.kind === "paper" ? "paper" : null;
  const text = body && typeof body.text === "string" ? body.text.trim() : "";
  if (!kind || !text) return res.status(400).json({ code: "invalid_request" });
  if (text.length > MAX_INPUT) return res.status(413).json({ code: "prompt_too_large" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ code: "rate_limited" });

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent";
    const r = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(kind, text) }] }],
        generationConfig: { maxOutputTokens: 8192 }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Gemini API error", r.status, JSON.stringify(data && data.error));
      // 429 = 무료 한도 소진, 400/403 = 키나 모델 이름 문제
      const code = r.status === 429 ? "quota" : (r.status === 400 || r.status === 403 || r.status === 404) ? "bad_config" : "upstream_error";
      return res.status(r.status === 429 ? 429 : 502).json({ code });
    }
    const cand = (data.candidates || [])[0] || {};
    const parts = (cand.content && cand.content.parts) || [];
    const out = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
    if (!out) return res.status(502).json({ code: cand.finishReason === "SAFETY" ? "refused" : "empty_completion" });
    return res.status(200).json({ text: out, truncated: cand.finishReason === "MAX_TOKENS" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ code: "upstream_error" });
  }
};
