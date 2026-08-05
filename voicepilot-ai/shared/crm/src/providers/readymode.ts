/**
 * ReadyMode — first integration target and design partner.
 *
 * ReadyMode is a cloud predictive dialer with a built-in CRM and a
 * browser-based agent interface, used by exactly our target customer: LATAM
 * outbound operations selling into the United States.
 *
 * **What makes it different from every other connector in this directory:
 * ReadyMode owns the audio path.** It is not where the call gets logged — it is
 * what places the call. Our media plane assumed we control the SIP route, and
 * that assumption does not hold here. See `docs/13-integracion-readymode.md`
 * for the three ways in and why one of them is disqualified.
 *
 * ---
 *
 * **This file is a capability declaration, not a working connector.** It was
 * written without access to a live ReadyMode instance. Everything that depends
 * on their actual API surface, DOM, or field names is marked `UNKNOWN` rather
 * than guessed, because a plausible-looking wrong selector is worse than an
 * honest blank: it produces a connector that appears to work and silently
 * writes to the wrong field.
 *
 * `docs/13` §6 lists exactly what to capture to fill these in. Most of it takes
 * minutes with the browser devtools open.
 */

import type { AdapterCapabilities } from "../adapter.ts";

/**
 * Marks a value that must be captured from a live instance before any code
 * depends on it. Reading one at runtime is a bug, and throws rather than
 * proceeding on a guess.
 */
export const UNKNOWN = Symbol("must be captured from a live instance");
export type Unknown = typeof UNKNOWN;

export function required<T>(value: T | Unknown, what: string): T {
  if (value === UNKNOWN) {
    throw new Error(
      `ReadyMode integration detail not yet captured: ${what}. ` +
        `See docs/13-integracion-readymode.md §6.`,
    );
  }
  return value;
}

/**
 * Level 1 — overlay. No API dependency.
 *
 * Chosen because the agent already lives in ReadyMode's screen all day and we
 * do not want to move them, and because ReadyMode's API surface is an unknown
 * that an overlay simply does not need.
 */
export const READYMODE_CAPABILITIES: AdapterCapabilities = {
  provider: "readymode",
  level: "overlay",
  entities: ["contact", "lead", "call", "note"],
  // Written by filling the host CRM's own form fields, not through an API.
  writable: ["note", "call", "lead.disposition"],
  readable: ["contact", "lead"],
  webhooks: false,
  customFields: false,
  resolveByPhone: false,

  /**
   * The flag that reorganises the project.
   *
   * ReadyMode places the call, so we cannot simply sit in the SIP path. This
   * forces either trunk interposition (`supportsCustomSipTrunk`) or an
   * agent-side virtual audio device — a completely different amount of work,
   * and one that has to be known at planning time rather than discovered
   * during integration.
   */
  ownsAudioPath: true,

  /**
   * The single highest-value unknown in the entire project right now.
   *
   * If ReadyMode allows a customer-supplied SIP trunk, the integration is the
   * architecture we already built and already tested. If it does not, the
   * audio path needs a signed audio driver on every agent workstation, and the
   * pilot becomes an IT project.
   *
   * `docs/13` §6 block 1, question 1.
   */
  supportsCustomSipTrunk: "unknown",
};

/**
 * DOM contract for the browser overlay.
 *
 * Deliberately a data shape rather than code, and served from our API rather
 * than compiled into the extension (`docs/07` §6). ReadyMode will change its
 * DOM without telling us; when it does, the fix is a JSON edit deployed in
 * minutes instead of a Chrome Web Store review measured in days — during which
 * the product would be broken for every customer at once.
 */
export interface OverlaySelectors {
  /** Matches the agent screen, so the overlay activates nowhere else. */
  agentScreenUrlPattern: string | Unknown;
  /** Where the currently open lead's identifier lives. */
  leadIdSource:
    | { kind: "url"; pattern: string }
    | { kind: "dom"; selector: string; attribute?: string }
    | Unknown;
  /**
   * How to tell a call just started.
   *
   * The most important selector in the file. Everything downstream fires from
   * it: the voice session, the transcript, the copilot. Without it there is no
   * product, only a side panel.
   */
  callStartSignal:
    | { kind: "dom_appears"; selector: string }
    | { kind: "dom_class"; selector: string; className: string }
    | { kind: "text_content"; selector: string; matches: string }
    | Unknown;
  callEndSignal:
    | { kind: "dom_disappears"; selector: string }
    | { kind: "dom_class"; selector: string; className: string }
    | Unknown;
  notesField: string | Unknown;
  dispositionControl: string | Unknown;
  customerPhoneField: string | Unknown;
  customerNameField: string | Unknown;
  /**
   * If the lead panel is inside a cross-origin iframe, content scripts cannot
   * reach it and the whole overlay approach needs rethinking. Cheap to check,
   * expensive to discover late. `docs/13` §6 block 2, question 6.
   */
  leadPanelInIframe: boolean | Unknown;
}

export const READYMODE_SELECTORS: OverlaySelectors = {
  agentScreenUrlPattern: UNKNOWN,
  leadIdSource: UNKNOWN,
  callStartSignal: UNKNOWN,
  callEndSignal: UNKNOWN,
  notesField: UNKNOWN,
  dispositionControl: UNKNOWN,
  customerPhoneField: UNKNOWN,
  customerNameField: UNKNOWN,
  leadPanelInIframe: UNKNOWN,
};

/**
 * Cascading detection, in order of durability.
 *
 * A single selector is a single point of failure against a DOM we do not
 * control. Four strategies, each less fragile than the fallback below it, and a
 * manual last resort so the agent is never blocked by our detection being wrong
 * — they click once and keep selling.
 */
export type DetectionStrategy =
  | { kind: "url"; pattern: string }
  | { kind: "data_attribute"; attribute: string }
  | { kind: "css_selector"; selector: string }
  | { kind: "manual" };

export const DETECTION_CASCADE: DetectionStrategy[] = [
  { kind: "url", pattern: "" },
  { kind: "data_attribute", attribute: "" },
  { kind: "css_selector", selector: "" },
  { kind: "manual" },
];

/**
 * Readiness gate for the ReadyMode connector.
 *
 * Returns what is still missing, so "are we ready to build this?" is a function
 * call rather than an opinion in a meeting.
 */
export function integrationReadiness(
  selectors: OverlaySelectors = READYMODE_SELECTORS,
  caps: AdapterCapabilities = READYMODE_CAPABILITIES,
): {
  ready: boolean;
  blockers: string[];
  audioPath: "sip" | "virtual-device" | "unknown";
} {
  const blockers: string[] = [];

  if (caps.supportsCustomSipTrunk === "unknown") {
    blockers.push(
      "audio path undecided: does ReadyMode accept a customer-supplied SIP trunk? " +
        "(docs/13 §6 block 1) — this decides whether the pilot is a weekend or a quarter",
    );
  }
  if (selectors.leadPanelInIframe === UNKNOWN) {
    blockers.push(
      "unknown whether the lead panel is a cross-origin iframe; if it is, the overlay approach does not work at all",
    );
  }
  if (selectors.callStartSignal === UNKNOWN) {
    blockers.push(
      "no call-start detection captured — nothing downstream can fire without it",
    );
  }
  if (selectors.leadIdSource === UNKNOWN) {
    blockers.push("no way to tell which lead is open");
  }
  if (selectors.notesField === UNKNOWN) {
    blockers.push("no notes field captured; writeback impossible");
  }

  const audioPath =
    caps.supportsCustomSipTrunk === "yes"
      ? "sip"
      : caps.supportsCustomSipTrunk === "no"
        ? "virtual-device"
        : "unknown";

  return { ready: blockers.length === 0, blockers, audioPath };
}
