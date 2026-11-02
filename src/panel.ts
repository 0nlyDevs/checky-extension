import "@fontsource-variable/archivo";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "./style.css";
import { t } from "./i18n/fr.ts";
import { api, ApiError, forgetToken, publicApi, publicStream, stream } from "./lib/api.ts";
import { config } from "./lib/config.ts";
import { button, el, icon } from "./lib/dom.ts";
import type { Icon } from "./lib/dom.ts";
import { checkBody, hostname, httpUrl, MAX_TEXT, validCapture } from "./lib/safety.ts";
import type { Capture, Mode } from "./lib/safety.ts";
import type { ImageResult, LinkResult, Me, Preparation, PublicResult, Step, StepKey, Verdict } from "./lib/types.ts";

type Sent = { mode: Mode; text: string; caption: string; url: string; pageUrl: string; ws: string; audience: "public" | "newsroom" };
type Saved = { id: string; ref: string | null; pending: string[] };
const root = document.querySelector<HTMLDivElement>("#app")!;
const formArea = el("div");
const outcome = el("div", { id: "outcome" });
const announce = el("p", { class: "sr-only", role: "status", "aria-live": "polite" });
const keys: StepKey[] = ["read", "claims", "search", "verdict"];
const freshSteps = (): Step[] => keys.map((key) => ({ key, status: "waiting", summary: "" }));
const state = {
  me: null as Me | null, ws: "", connecting: false, authError: "",
  audience: "public" as "public" | "newsroom", savePrompt: false,
  mode: "text" as Mode, text: "", caption: "", url: "", pageUrl: "", truncated: false,
  running: false, saving: false, complete: false, error: "", revision: 0,
  result: null as LinkResult | null, image: null as ImageResult | null, sent: null as Sent | null,
  publicResult: null as PublicResult | null,
  preparation: null as Preparation | null,
  steps: freshSteps(), log: [] as { time: string; text: string }[], picked: new Set<string>(), claim: 0,
  includeOriginal: true, saved: null as Saved | null, uncertainSave: false,
};
let controller: AbortController | null = null;
let captureKey = "";
let captureId = "";
let queuedCapture: Capture | null = null;
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function link(url: string, text: string, className = ""): HTMLElement {
  const safe = httpUrl(url);
  return safe ? el("a", { href: safe, target: "_blank", rel: "noopener noreferrer", referrerpolicy: "no-referrer", class: className }, text, icon("external")) : el("span", {}, text);
}
const workspacePath = (ws = state.ws) => `/workspaces/${encodeURIComponent(ws)}`;
const deskUrl = (ws = state.ws) => `${config.webUrl}/w/${encodeURIComponent(ws)}/affirmations`;
const claimUrl = (id: string, ws = state.sent?.ws || state.ws) => `${deskUrl(ws)}/${encodeURIComponent(id)}`;

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return t.errors.unauthorized;
    if ([403, 404].includes(error.status)) return state.audience === "public" && !state.saving ? t.errors.publicUnavailable : t.errors.forbidden;
    if (error.status === 429) return t.errors.rateLimit;
    if (error.status === 422) return t.errors.invalid;
    if (error.code === "ai_unavailable" || error.status === 503) return t.errors.unavailable;
    if (error.status === 0) return t.errors.network;
  }
  if (error instanceof Error && error.message === "incomplete") return t.errors.incomplete;
  return t.errors.failed;
}

function resetResults(): void {
  state.result = null; state.image = null; state.saved = null; state.sent = null;
  state.publicResult = null; state.preparation = null; state.savePrompt = false;
  state.complete = false; state.error = ""; state.steps = freshSteps(); state.log = [];
  state.picked.clear(); state.claim = 0; state.uncertainSave = false;
  outcome.replaceChildren();
}

function stop(message = ""): void {
  state.revision++; controller?.abort(); controller = null; state.running = false;
  state.complete = false; state.result = null; state.publicResult = null; state.preparation = null; state.image = null; state.error = message;
}

async function connect(): Promise<void> {
  if (state.running || state.saving) return;
  if (state.sent?.audience !== "public") resetResults();
  state.connecting = true; state.authError = ""; render();
  try {
    // Explicit connection follows the website's current account, not a previous cached JWT.
    await forgetToken();
    const me = await api<Me>("/me");
    const stored = (await chrome.storage.session.get("fanilo-workspace"))["fanilo-workspace"] as string | undefined;
    state.me = me;
    state.ws = me.memberships.find((m) => m.workspace_id === stored)?.workspace_id || me.memberships[0]?.workspace_id || "";
  } catch (error) { state.me = null; state.ws = ""; state.authError = errorText(error); }
  finally { state.connecting = false; render(); }
}

async function disconnect(): Promise<void> {
  stop(); resetResults();
  await forgetToken();
  await chrome.storage.session.remove([captureKey, "fanilo-workspace"]);
  state.me = null; state.ws = ""; state.text = ""; state.caption = ""; state.url = ""; state.pageUrl = "";
  state.audience = "public"; state.authError = t.disconnectHelp; render();
}

function connectionControls(): HTMLElement {
  return el("section", { class: "connection", "aria-labelledby": "connection-title" },
    el("h2", { id: "connection-title" }, state.connecting ? t.connecting : t.signedOut),
    el("p", { class: "muted" }, t.signInHelp),
    state.authError && el("p", { role: "status", class: "notice" }, state.authError),
    el("div", { class: "button-row" }, link(`${config.webUrl}/connexion`, t.connect, "button ink"), button(t.reconnect, () => { void connect(); }, { disabled: state.connecting })),
    el("details", {}, el("summary", {}, t.cookieHelpTitle), el("p", {}, t.cookieHelp)),
  );
}

function chooseWorkspace(): HTMLElement {
  if (!state.me?.memberships.length) return el("div", {}, el("p", { class: "notice" }, t.noWorkspace), button(t.reconnect, () => { void connect(); }, { disabled: state.connecting }));
  const select = el("select", { id: "workspace", disabled: state.running || state.saving || state.connecting });
  for (const membership of state.me.memberships) {
    const option = el("option", { value: membership.workspace_id }, membership.name);
    option.selected = membership.workspace_id === state.ws;
    select.append(option);
  }
  select.addEventListener("change", () => {
    state.ws = select.value;
    if (state.sent?.audience !== "public") { stop(); resetResults(); }
    void chrome.storage.session.set({ "fanilo-workspace": state.ws }); render();
  });
  return el("div", { class: "workspace-row" }, el("label", { for: "workspace" }, t.workspace), select);
}

function renderAuth(): HTMLElement {
  if (state.audience === "public") return el("section", { class: "public-access" },
    el("div", { class: "identity-top" }, el("span", {}, t.publicMode), button(t.newsroomMode, () => {
      stop(); resetResults(); state.audience = "newsroom"; render(); void connect();
    }, { class: "quiet", disabled: state.running || state.saving || state.connecting })),
    el("p", { class: "muted" }, t.publicHelp),
  );
  const back = button(t.continuePublic, () => { stop(); resetResults(); state.audience = "public"; render(); }, { class: "quiet", disabled: state.running || state.saving });
  if (!state.me) return el("div", {}, back, connectionControls());
  const node = el("section", { class: "identity" },
    el("div", { class: "identity-top" }, el("span", {}, state.me.name || state.me.email || t.name), button(t.disconnect, () => { void disconnect(); }, { class: "quiet", disabled: state.running || state.saving })),
    chooseWorkspace(), back,
  );
  if (!state.me.memberships.length || state.error === t.errors.unauthorized || state.error === t.errors.forbidden) {
    node.append(button(t.reconnect, () => { void connect(); }, { class: "quiet", disabled: state.connecting || state.running || state.saving }));
  }
  return node;
}

function render(): void {
  const busy = state.running || state.saving;
  const tabs = el("div", { class: "mode-tabs", role: "group", "aria-label": t.modeLabel });
  for (const mode of ["text", "link", "image"] as const) tabs.append(button(t.modes[mode], () => {
    stop(); resetResults(); state.mode = mode; state.truncated = false; render();
  }, { "aria-pressed": String(state.mode === mode), disabled: busy }));
  const form = el("form", { class: "capture-form" });
  if (state.mode === "text") {
    const field = el("textarea", { id: "content", minlength: state.audience === "public" ? "3" : "1", maxlength: String(MAX_TEXT), rows: "5", placeholder: t.inputPlaceholder, required: true, disabled: busy });
    field.value = state.text;
    const count = el("span", { class: "count", "aria-hidden": "true" }, `${state.text.length} / ${MAX_TEXT}`);
    field.addEventListener("input", () => { state.text = field.value; state.truncated = false; count.textContent = `${state.text.length} / ${MAX_TEXT}`; resetResults(); });
    form.append(el("label", { for: "content" }, t.input), field, count);
  } else {
    const field = el("input", { id: "content-url", type: "url", maxlength: "2000", placeholder: t.urlPlaceholder, required: true, disabled: busy });
    field.value = state.url;
    field.addEventListener("input", () => { state.url = field.value; resetResults(); });
    form.append(el("label", { for: "content-url" }, state.mode === "image" ? t.imageUrl : t.url), field);
    if (state.mode === "image") {
      const caption = el("textarea", { id: "caption", rows: "3", minlength: state.audience === "public" ? "3" : "1", maxlength: String(MAX_TEXT), placeholder: t.captionPlaceholder, disabled: busy });
      caption.value = state.caption;
      caption.addEventListener("input", () => { state.caption = caption.value; resetResults(); });
      form.append(el("label", { for: "caption" }, t.caption), caption);
    }
  }
  if (state.pageUrl) form.append(el("div", { class: "source-origin" }, el("span", {}, t.page), link(state.pageUrl, hostname(state.pageUrl))));
  if (state.truncated) form.append(el("p", { class: "notice", role: "status" }, t.truncated));
  form.append(el("p", { class: "privacy" }, t.privacy), state.mode === "image" ? el("p", { class: "privacy" }, t.privacyImage) : el("span"));
  form.append(el("p", { class: "privacy" }, t.consent));
  if (state.audience === "public") form.append(el("p", { class: "privacy" }, t.publicAiPrivacy));
  const actions = el("div", { class: "form-actions" });
  if (state.running) actions.append(button(t.cancel, () => { stop(t.canceled); render(); }, { class: "ink" }));
  else actions.append(el("button", { type: "submit", class: state.complete && !state.saved && !state.result?.tracked ? "" : "action", disabled: (state.audience === "newsroom" && !state.ws) || state.connecting || state.saving }, state.mode === "image" ? t.inspect : t.analyze));
  actions.append(button(t.clear, () => {
    stop(); resetResults(); state.text = ""; state.url = ""; state.caption = ""; state.pageUrl = ""; state.truncated = false;
    void chrome.storage.session.remove(captureKey); render();
  }, { class: "quiet", disabled: busy }));
  form.append(actions);
  form.addEventListener("submit", (event) => { event.preventDefault(); if (!state.running && !state.saving) void run(); });
  formArea.replaceChildren(renderAuth(), el("section", { class: "input-section" }, tabs, form));
  renderOutcome();
}

function line(): HTMLElement {
  const phase = state.running ? state.steps.findLast((s) => s.status === "running")?.key : undefined;
  const active = phase === "search" ? 1 : phase === "verdict" ? 2 : 0;
  const node = el("ol", { class: "step-line", "aria-label": t.logTitle });
  const labels = state.sent?.audience === "public" && (state.sent.mode !== "image" || state.sent.caption.trim()) ? t.publicSteps : t.steps;
  labels.forEach((label, i) => {
    const failed = i === 1 && state.steps.find((s) => s.key === "search")?.status === "failed";
    const reading = state.steps.find((s) => s.key === "verdict");
    const unread = labels === t.publicSteps && state.complete && i === 2 && reading?.status !== "done";
    const noPassages = labels === t.publicSteps && state.complete && i === 2 && reading?.status === "done" && reading.count === 0;
    const status = unread ? "waiting" : failed || noPassages ? "failed" : state.complete ? (i === 2 && state.sent?.audience === "newsroom" ? "suggested" : "done") : state.running ? (i < active ? "done" : i === active ? "active" : "waiting") : "waiting";
    node.append(el("li", { class: status, ...(status === "active" ? { "aria-current": "step" } : {}) }, el("span", { class: "disc" }, status === "done" ? icon("check") : status === "failed" ? icon("cross") : String(i + 1).padStart(2, "0")), el("span", {}, label)));
  });
  return node;
}

function renderOutcome(): void {
  outcome.replaceChildren();
  if (!state.running && !state.complete && !state.error) return;
  outcome.append(line());
  if (state.log.length) outcome.append(el("details", { class: "work-log", open: state.running }, el("summary", {}, t.logTitle), ...state.log.slice(-14).map((item) => el("p", {}, el("time", {}, item.time), el("span", {}, item.text)))));
  if (state.error) outcome.append(el("p", { class: "notice error", role: "alert" }, icon("alert"), state.error));
  if (state.running) outcome.append(el("p", { class: "running", role: "status" }, t.busy));
  if (state.preparation) outcome.append(renderPreparation(state.preparation));
  if (state.image) outcome.append(renderImage(state.image));
  if (state.result) outcome.append(renderTextResult(state.result));
  if (state.publicResult) outcome.append(renderPublicResult(state.publicResult));
  if (state.complete) outcome.append(renderSave());
}

function renderImage(result: ImageResult): HTMLElement {
  const facts = result.image;
  const stateIcon: Icon = result.assessment === "detected" ? "alert" : "help";
  const resultNode = el("section", { class: "image-result", "aria-labelledby": "image-result-title" },
    el("h2", { id: "image-result-title" }, icon("image"), t.imageTitle),
    el("div", { class: "image-assessment" }, icon(stateIcon), el("h3", {}, t.imageStates[result.assessment])),
    el("p", { class: "notice" }, t.imageDisclaimer),
    el("h3", {}, t.metadata), el("p", { class: "muted" }, `${facts.width} × ${facts.height} · ${facts.format}`),
    facts.ai_markers.length ? el("div", {}, el("h4", {}, t.markers), el("ul", {}, ...facts.ai_markers.map((marker) => el("li", {}, marker)))) : el("p", {}, t.noMarkers),
    facts.content_credentials && el("p", { class: "notice" }, t.credentials),
    el("h3", {}, t.detector), el("p", {}, t.detectorStates[result.detector.status]),
    result.detector.status === "assessed" && el("p", {}, t.detectorSignals[result.detector.assessment || "inconclusive"]),
    result.detector.model && el("p", { class: "muted" }, result.detector.model),
    el("p", { class: "muted" }, t.imageContext),
    el("h3", {}, t.reverse), el("p", { class: "muted" }, t.reverseHelp),
    el("div", { class: "reverse-links" }, ...result.reverse_search.map((entry) => link(entry.url, entry.name))),
    link(result.url, t.imageLink),
  );
  return resultNode;
}

function renderTextResult(result: LinkResult): HTMLElement {
  const node = el("section", { class: "text-result" });
  if (result.needs_text) node.append(el("p", { class: "notice" }, t.needsText));
  const analysis = result.analysis;
  if (analysis && Object.hasOwn(t.verdicts, analysis.verdict)) {
    const verdictIcons: Record<Verdict, Icon> = { true: "check", false: "cross", misleading: "alert", unverifiable: "help" };
    node.append(el("section", { class: `verdict ${analysis.verdict}`, "aria-label": t.conclusion },
      el("h2", {}, icon(verdictIcons[analysis.verdict]), t.verdicts[analysis.verdict]),
      el("p", { class: "suggestion" }, t.suggestion), el("p", {}, analysis.reason),
    ));
  } else node.append(el("div", { class: "no-conclusion" }, el("h2", {}, icon("help"), t.noConclusion), el("p", {}, t.noConclusionHelp)));
  node.append(el("p", { class: "notice" }, t.disclaimer));
  if (result.days_old && result.days_old > 30) node.append(el("p", { class: "notice" }, icon("alert"), t.old));
  if (result.published_at) node.append(el("p", { class: "muted" }, `${t.date} : ${result.published_at}`));
  if (result.summary) node.append(el("p", { class: "summary" }, result.summary));
  if (result.claims?.length) {
    const select = el("select", { id: "claim-to-save", disabled: state.saving || !!state.saved });
    result.claims.forEach((claim, i) => { const option = el("option", { value: String(i) }, claim); option.selected = i === state.claim; select.append(option); });
    select.addEventListener("change", () => { state.claim = Number(select.value); });
    node.append(el("label", { for: "claim-to-save" }, t.claimToSave), select);
  }
  if (result.signals?.length) node.append(el("details", { class: "warning-signs" }, el("summary", {}, t.signals), ...result.signals.map((signal) => el("div", {}, el("blockquote", {}, signal.quote), el("p", {}, signal.why)))));
  node.append(renderSources(result));
  if (analysis?.missing) node.append(el("h3", {}, t.missing), el("p", {}, analysis.missing));
  return node;
}

function renderSources(result: Pick<LinkResult, "results" | "analysis">, emptyMessage: string = t.noSources): HTMLElement {
  const node = el("div");
  const analysis = result.analysis;
  const found = result.results || [];
  node.append(el("h2", { class: "section-title" }, t.sources), el("p", { class: "muted" }, found.length ? t.sourcesHelp : emptyMessage));
  for (const source of found) {
    const sourceUrl = httpUrl(source.url);
    if (!sourceUrl) continue;
    const evidence = analysis?.evidence?.filter((entry) => entry.result === source.n) || [];
    const checkbox = el("input", { type: "checkbox", disabled: state.saving || !!state.saved, "aria-label": `${t.includeSource} : ${source.title}` });
    checkbox.checked = state.picked.has(sourceUrl);
    checkbox.addEventListener("change", () => { if (checkbox.checked) state.picked.add(sourceUrl); else state.picked.delete(sourceUrl); });
    node.append(el("article", { class: "source" },
      el("div", { class: "source-meta" }, el("span", {}, `[${source.n}] ${hostname(sourceUrl)}`), el("label", { class: "check-target" }, checkbox)),
      el("h3", {}, link(sourceUrl, source.title)),
      source.date && el("p", { class: "muted" }, source.date),
      source.read_status && el("p", { class: "muted" }, t.searchSnippet),
      el("p", {}, source.snippet),
      source.read_status && el("p", { class: "source-read-status" }, t.readStates[source.read_status as keyof typeof t.readStates] || t.readStates.not_read),
      ...(source.passages || []).map((passage) => el("blockquote", { class: "read-passage" }, passage)),
      source.wording_overlap && el("p", { class: "notice" }, t.wordingOverlap),
      !!source.similar_to?.length && el("p", { class: "notice" }, `${t.similarSources} ${source.similar_to.map((n) => `[${n}]`).join(", ")}`),
      source.older_than_claim && el("p", { class: "notice" }, t.olderSource),
      ...evidence.map((entry) => el("blockquote", {}, el("span", { class: "stance" }, t.stances[entry.stance] || t.stances.context), entry.quote)),
    ));
  }
  return node;
}

function renderPreparation(plan: Preparation): HTMLElement {
  return el("section", { class: "preparation" },
    el("details", { open: state.running }, el("summary", {}, t.preparation),
      plan.summary && el("blockquote", {}, plan.summary),
      el("ul", {}, ...(plan.claims || []).map((claim) => el("li", {}, claim))),
    ),
    plan.method === "fallback" && el("p", { class: "notice" }, plan.warning === "disabled" ? t.preparationDisabled : t.preparationFallback),
    plan.cached && el("p", { class: "muted" }, t.preparationCached),
    el("h2", {}, t.preparedQueries),
    el("p", { class: "muted" }, t.manualSearchHelp),
    el("ol", { class: "prepared-queries" }, ...(plan.queries || []).map((query) => el("li", {}, link(`https://www.google.com/search?q=${encodeURIComponent(query)}`, query)))),
  );
}

function renderPublicResult(result: PublicResult): HTMLElement {
  const node = el("section", { class: "public-result" });
  if (result.search_status && result.search_status !== "ok" && result.preparation) node.append(el("p", { class: "notice search-status", role: "status" }, t.searchStatus[result.search_status as keyof typeof t.searchStatus] || t.searchStatus.partial));
  if (result.searches?.length) node.append(el("details", { class: "search-details" }, el("summary", {}, t.searchDetails),
    ...result.searches.map((attempt) => el("p", {}, el("strong", {}, `${t.sourceKinds[attempt.kind]} · ${t.searchAttempt[attempt.status]}`), el("span", {}, attempt.query))),
  ));
  if (result.needs_text) node.append(el("p", { class: "notice" }, t.needsText));
  if (result.kind === "image") node.append(el("p", { class: "notice" }, t.publicImageLink));
  if (result.days_old && result.days_old > 30) node.append(el("p", { class: "notice" }, icon("alert"), t.old));
  if (result.published_at) node.append(el("p", { class: "muted" }, `${t.date} : ${result.published_at}`));
  if (result.published.length) {
    node.append(el("h2", {}, t.publicMatches), el("p", { class: "notice" }, t.publicMatchHelp));
    const icons: Record<Verdict, Icon> = { true: "check", false: "cross", misleading: "alert", unverifiable: "help" };
    for (const entry of result.published) {
      if (!Object.hasOwn(t.verdicts, entry.verdict)) continue;
      const verdict = entry.verdict as Verdict;
      node.append(el("article", { class: `verdict published-verdict ${verdict}` },
        el("h3", {}, entry.title),
        el("p", { class: "published-word" }, icon(icons[verdict]), t.verdicts[verdict]),
        el("p", { class: "suggestion" }, t.publicPublished),
        entry.reason && el("p", {}, entry.reason),
        el("p", { class: "suggestion" }, `${entry.newsroom.name} · ${t.publicPublishedOn} ${entry.published_at.slice(0, 10)}`),
        link(`${config.webUrl}/verifies/${encodeURIComponent(entry.id)}`, t.readPublished),
      ));
    }
  } else node.append(el("div", { class: "no-conclusion" }, el("h2", {}, icon("help"), t.publicEmpty), el("p", {}, t.publicEmptyHelp)));
  node.append(renderSources({ results: result.results.map((source) => ({ ...source, date: source.date || undefined })) }, result.search_status === "unavailable" ? t.searchNoAccess : t.noSources));
  return node;
}

function renderSave(): HTMLElement {
  const node = el("section", { class: "save-section" });
  if (state.result?.tracked && !state.saved) return el("section", { class: "save-section" }, el("p", {}, t.alreadyTracked), link(claimUrl(state.result.tracked.item_id), t.openClaim, "button ink"));
  if (state.saved) {
    node.append(el("p", { class: "saved-message", role: "status" }, icon("check"), t.saved, state.saved.ref ? ` · ${state.saved.ref}` : ""), link(claimUrl(state.saved.id), t.openClaim, "button ink"));
    if (state.saved.pending.length) node.append(el("p", { class: "notice" }, t.partialSave), button(t.retrySources, () => { void save(); }, { disabled: state.saving }));
    return node;
  }
  const sent = state.sent;
  if (!state.me || !state.ws) {
    node.append(button(t.publicSave, () => { state.savePrompt = true; renderOutcome(); }, { class: "action", disabled: state.connecting }), el("p", { class: "privacy" }, t.publicSaveHelp));
    if (state.savePrompt) {
      node.append(state.me ? chooseWorkspace() : connectionControls(), button(t.dismissConnection, () => { state.savePrompt = false; renderOutcome(); }, { class: "quiet" }));
    }
    return node;
  }
  if (sent?.audience === "public") node.append(
    el("div", { class: "identity-top" }, el("span", {}, state.me.name || state.me.email || t.name), button(t.disconnect, () => { void disconnect(); }, { class: "quiet", disabled: state.saving })),
    chooseWorkspace(),
  );
  if (sent && (sent.url || sent.pageUrl)) {
    const checkbox = el("input", { type: "checkbox", disabled: state.saving });
    checkbox.checked = state.includeOriginal;
    checkbox.addEventListener("change", () => { state.includeOriginal = checkbox.checked; });
    node.append(el("label", { class: "include-original" }, checkbox, t.includeSource));
  }
  node.append(button(state.saving ? t.tracking : t.track, () => { void save(); }, { class: "action", disabled: state.saving || state.uncertainSave }), el("p", { class: "privacy" }, t.saveHint));
  if (state.uncertainSave) node.append(link(deskUrl(sent?.ws), t.openDesk));
  return node;
}

function log(text: string): void { state.log.push({ time: clock.format(new Date()), text }); }

async function run(): Promise<void> {
  if (state.audience === "newsroom" && !state.ws) return;
  let body: { text?: string; url?: string };
  try { body = checkBody(state.mode, state.text, state.url); }
  catch { state.error = t.invalidUrl; renderOutcome(); return; }
  resetResults();
  const sent: Sent = { mode: state.mode, text: state.text, caption: state.caption, url: body.url || "", pageUrl: state.pageUrl, ws: state.ws, audience: state.audience };
  state.sent = sent; state.running = true;
  const revision = ++state.revision;
  controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
  announce.textContent = t.busy; render();
  try {
    if (sent.mode === "image") {
      state.steps[0]!.status = "running"; log(t.logs.read); renderOutcome();
      const image = sent.audience === "public"
        ? await publicApi<ImageResult>("/public/image-check", body, signal)
        : await api<ImageResult>(`${workspacePath(sent.ws)}/image-check`, body, signal);
      if (revision !== state.revision) return;
      state.image = image; state.steps[0]!.status = "done";
      if (sent.caption.trim()) body = { text: sent.caption.trim() };
    }
    if (sent.mode !== "image" || sent.caption.trim()) {
      if (sent.audience === "public") {
        let result: PublicResult | null = null;
        await publicStream("/public/check/stream", body, (event) => {
          if (revision !== state.revision) return;
          if (event.event === "preparation") {
            state.preparation = event.data as Preparation;
            renderOutcome();
          } else if (event.event === "step") {
            const step = event.data as Step & { count?: number; search_status?: string };
            const index = keys.indexOf(step.key);
            if (index >= 0) state.steps[index] = step;
            if (step.status === "running") log(t.publicLogs[step.key] || t.publicWorking);
            else if (step.key === "search") {
              const status = step.search_status;
              log(status === "unavailable" ? t.searchStatus.unavailable : status === "partial" ? t.searchStatus.partial : t.publicSourcesFound(step.count || 0));
            } else if (step.key === "verdict") log(t.sourcesRead(step.count || 0));
            renderOutcome();
          } else if (event.event === "result") result = event.data as PublicResult;
          else if (event.event === "error") throw new ApiError(503, (event.data as { code?: string }).code || "failed");
        }, signal);
        if (!result) throw new Error("incomplete");
        if (revision !== state.revision) return;
        state.publicResult = result;
      } else {
        let result: LinkResult | null = null;
        await stream(`${workspacePath(sent.ws)}/link-check`, body, (event) => {
          if (revision !== state.revision) return;
          if (event.event === "step") {
            const step = event.data as Step;
            const index = keys.indexOf(step.key);
            if (index >= 0) state.steps[index] = step;
            if (step.status === "running") log(t.logs[step.key] || t.busy);
            else if (step.summary && step.key !== "verdict") log(step.summary);
            renderOutcome();
          } else if (event.event === "result") result = event.data as LinkResult;
          else if (event.event === "error") throw new ApiError(500, (event.data as { code?: string }).code || "failed");
        }, signal);
        if (!result) throw new Error("incomplete");
        if (revision !== state.revision) return;
        state.result = result;
        const value = result as LinkResult;
        const cited = new Set(value.analysis?.evidence?.map((entry) => entry.result) || []);
        state.picked = new Set((value.results || []).filter((source) => cited.has(source.n)).map((source) => httpUrl(source.url)).filter((url): url is string => !!url));
      }
    }
    if (revision === state.revision) { state.complete = true; announce.textContent = t.steps[2]; }
  } catch (error) {
    if (revision === state.revision) { state.error = errorText(error); state.complete = false; announce.textContent = state.error; }
  } finally {
    if (revision === state.revision) { state.running = false; controller = null; render(); }
  }
}

async function save(): Promise<void> {
  if (!state.sent || !state.complete || state.saving || state.uncertainSave) return;
  if (!state.me || !state.ws) { state.savePrompt = true; renderOutcome(); return; }
  const sent = state.sent = { ...state.sent, ws: state.ws };
  state.saving = true; state.error = ""; render();
  try {
    if (!state.saved) {
      const title = state.result?.claims?.[state.claim] || sent.caption.trim() || state.result?.title || state.publicResult?.title || sent.text || sent.url;
      const body = [state.result?.summary, sent.text, sent.caption, sent.url, sent.pageUrl].filter(Boolean).join("\n\n").slice(0, 4000);
      const made = await api<{ item_id: string; ref: string | null }>(`${workspacePath(sent.ws)}/copilot/act`, { kind: "create_claim", title: title.slice(0, 300), body, origin: "other" });
      if (!made.item_id) throw new Error("incomplete");
      const originals = state.includeOriginal ? [sent.url, sent.pageUrl] : [];
      const links = [...originals, ...state.picked].map(httpUrl).filter((url): url is string => !!url);
      state.saved = { id: made.item_id, ref: made.ref, pending: [...new Set(links)] };
    }
    const saved = state.saved;
    for (const url of [...saved.pending]) {
      try {
        await api(`${workspacePath(sent.ws)}/copilot/act`, { kind: "attach_link", item_id: saved.id, url });
        saved.pending = saved.pending.filter((entry) => entry !== url);
      } catch { /* Preserve only the failed attachments; never recreate the dossier. */ }
    }
  } catch (error) {
    state.uncertainSave = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
    state.error = state.uncertainSave ? t.saveUncertain : t.saveFailed;
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      state.me = null; state.ws = ""; state.savePrompt = true; state.authError = t.errors.unauthorized;
      state.error = t.errors.unauthorized;
    }
  } finally {
    state.saving = false; render();
    if (queuedCapture) {
      const capture = queuedCapture; queuedCapture = null;
      outcome.append(button(t.nextCapture, () => { applyCapture(capture); }));
    }
  }
}

function applyCapture(capture: Capture): void {
  if (!validCapture(capture) || capture.id === captureId) return;
  if (state.saving) { queuedCapture = capture; return; }
  captureId = capture.id; stop(); resetResults();
  void chrome.storage.session.remove(captureKey);
  state.mode = capture.kind; state.text = capture.text; state.url = capture.url;
  state.caption = ""; state.pageUrl = capture.pageUrl; state.truncated = capture.truncated;
  render(); document.querySelector<HTMLElement>(state.mode === "text" ? "#content" : "#content-url")?.focus();
}

async function start(): Promise<void> {
  root.append(el("header", { class: "masthead" },
    el("div", { class: "brand" }, el("img", { src: "icons/32.png", alt: "", width: "28", height: "28" }), el("span", {}, t.name)),
    link(config.webUrl, t.open, "quiet-link"),
  ), el("main", {}, el("div", { class: "intro" }, el("h1", {}, t.title), el("p", {}, t.lead)), formArea, outcome), el("footer", {}, t.footer), announce);
  const window = await chrome.windows.getCurrent();
  captureKey = `capture:${window.id}`;
  chrome.storage.onChanged.addListener((changes, area) => {
    const value: unknown = changes[captureKey]?.newValue;
    if (area === "session" && value) {
      if (validCapture(value)) applyCapture(value);
    }
  });
  const stored: unknown = (await chrome.storage.session.get(captureKey))[captureKey];
  if (validCapture(stored)) applyCapture(stored);
  else if (stored) await chrome.storage.session.remove(captureKey);
  render();
}

void start().catch(() => { root.replaceChildren(el("p", { class: "notice", role: "alert" }, t.errors.failed)); });
