// app.js — the full demo: WebGPU check → pick a model → progress bar → streaming chat in a web worker.
// WebLLM is loaded after the WebGPU check, so a blocked or slow CDN shows a clear message instead of a stuck page.
const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.85";
let CreateWebWorkerMLCEngine, hasModelInCache;

const $ = (id) => document.getElementById(id);

// Small models first. Sizes are approximate first-time downloads; after that they are saved in the browser.
const MODELS = [
  { name: "Qwen3 0.6B (smallest, ~350 MB)", f16: "Qwen3-0.6B-q4f16_1-MLC", f32: "Qwen3-0.6B-q4f32_1-MLC", qwen3: true },
  { name: "Llama 3.2 1B (~700 MB)", f16: "Llama-3.2-1B-Instruct-q4f16_1-MLC", f32: "Llama-3.2-1B-Instruct-q4f32_1-MLC" },
  { name: "Qwen3 1.7B (smarter, ~1 GB)", f16: "Qwen3-1.7B-q4f16_1-MLC", f32: "Qwen3-1.7B-q4f32_1-MLC", qwen3: true },
];

let engine = null, loadedId = null, useF16 = true, busy = false;
const history = [{ role: "system", content: "You are a friendly, concise assistant running privately inside the user's browser." }];

// ------------------------------------------------------------------ 1. WebGPU check
async function checkGPU() {
  const dot = $("gpu-dot"), text = $("gpu-text"), help = $("gpu-help");
  const fail = (msg, tip) => { dot.className = "dot bad"; text.textContent = msg; help.textContent = tip; help.hidden = false; };
  if (!("gpu" in navigator)) {
    return fail("This browser doesn't have WebGPU yet.",
      "Try the latest Chrome or Edge on a laptop or desktop. Safari needs version 26 or newer; Firefox support depends on your system.");
  }
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter(); } catch (e) { /* handled below */ }
  if (!adapter) {
    return fail("WebGPU is here, but no graphics chip was offered.",
      "Check that hardware acceleration is on in your browser settings, then reload.");
  }
  useF16 = adapter.features.has("shader-f16");
  const maxBuf = adapter.limits.maxStorageBufferBindingSize / (1024 * 1024);
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile || maxBuf < 512) {
    dot.className = "dot warn";
    text.textContent = "WebGPU works, but this device may be short on graphics memory.";
    help.textContent = `The biggest memory chunk here is about ${Math.round(maxBuf)} MB. Stick to the smallest model; laptops and desktops work best.`;
    help.hidden = false;
  } else {
    dot.className = "dot ok";
    text.textContent = "WebGPU is ready. Your browser can run AI on your graphics chip.";
  }
  try {
    ({ CreateWebWorkerMLCEngine, hasModelInCache } = await import(WEBLLM_URL));
  } catch (e) {
    return fail("WebGPU is fine, but the WebLLM library couldn't be downloaded.",
      "Check your internet connection, and turn off ad blockers or firewalls that block esm.run / cdn.jsdelivr.net, then reload.");
  }
  $("setup").hidden = false;
  await fillModels();
}

// ------------------------------------------------------------------ 2. model picker (+ "already saved?" note)
const idOf = (m) => (useF16 ? m.f16 : m.f32);
async function fillModels() {
  const sel = $("model");
  for (const [i, m] of MODELS.entries()) {
    const cached = await hasModelInCache(idOf(m)).catch(() => false);
    sel.add(new Option(m.name + (cached ? " · saved" : ""), i));
  }
  sel.onchange = updateCacheNote;
  updateCacheNote();
}
async function updateCacheNote() {
  const cached = await hasModelInCache(idOf(MODELS[$("model").value])).catch(() => false);
  $("cache-note").textContent = cached
    ? "Already saved on this computer: it will start from disk, even with no internet."
    : "First time: your browser downloads the model once, then keeps it.";
}

// ------------------------------------------------------------------ 3. load with a progress bar, in a web worker
async function loadModel() {
  const m = MODELS[$("model").value], id = idOf(m);
  if (id === loadedId) return;
  setBusy(true);
  $("progress").hidden = false;
  const onProgress = (p) => {
    $("bar-fill").style.width = `${Math.round((p.progress ?? 0) * 100)}%`;
    $("progress-text").textContent = p.text;
  };
  try {
    if (!engine) {
      const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      engine = await CreateWebWorkerMLCEngine(worker, id, { initProgressCallback: onProgress });
    } else {
      engine.setInitProgressCallback(onProgress);
      await engine.reload(id);
    }
    loadedId = id;
    $("progress-text").textContent = `${m.name.split(" (")[0]} is ready. Try switching your Wi-Fi off and asking something.`;
    $("chat").hidden = false;
    $("input").focus();
    updateCacheNote();
  } catch (e) {
    const msg = String(e?.message ?? e);
    $("progress-text").textContent = /fetch|network/i.test(msg)
      ? "Couldn't download the model. The first download needs internet; check your connection and try again."
      : "Couldn't load the model: " + msg;
  }
  setBusy(false);
}

// ------------------------------------------------------------------ 4. chat: words stream back one at a time
function bubble(role, text = "") {
  const el = document.createElement("div");
  el.className = `msg ${role}`; el.textContent = text;
  $("messages").append(el); el.scrollIntoView({ block: "end", behavior: "smooth" });
  return el;
}

async function send(e) {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text || busy || !engine) return;
  $("input").value = "";
  bubble("user", text);
  history.push({ role: "user", content: text });
  const out = bubble("ai"); out.classList.add("typing");
  setBusy(true, true);
  let reply = "";
  try {
    const qwen3 = MODELS.find((m) => idOf(m) === loadedId)?.qwen3;
    const chunks = await engine.chat.completions.create({
      messages: history,
      stream: true,
      stream_options: { include_usage: true },
      ...(qwen3 ? { extra_body: { enable_thinking: false } } : {}),
    });
    for await (const c of chunks) {
      reply += c.choices[0]?.delta?.content ?? "";
      out.textContent = reply.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trimStart();
      if (c.usage?.extra?.decode_tokens_per_s) {
        $("stats").textContent = `${c.usage.extra.decode_tokens_per_s.toFixed(1)} word pieces per second, on your own graphics chip`;
      }
    }
  } catch (err) {
    out.textContent = reply || "Something went wrong: " + (err?.message ?? err);
  }
  out.classList.remove("typing");
  history.push({ role: "assistant", content: out.textContent });
  setBusy(false);
  $("input").focus();
}

function setBusy(b, generating = false) {
  busy = b;
  $("load").disabled = b;
  $("model").disabled = b;
  $("input").disabled = b || !engine;
  $("send").disabled = b || !engine;
  $("stop").hidden = !generating;
}

$("load").onclick = loadModel;
$("form").onsubmit = send;
$("stop").onclick = () => engine?.interruptGenerate();
checkGPU().catch((e) => {
  $("gpu-dot").className = "dot bad";
  $("gpu-text").textContent = "Something went wrong: " + (e?.message ?? e);
});
