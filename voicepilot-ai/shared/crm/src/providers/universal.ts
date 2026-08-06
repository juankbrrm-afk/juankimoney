/**
 * The adapter for a CRM nobody has integrated with.
 *
 * This is the one that makes "works with any CRM" a fact rather than a
 * slogan. `docs/07` §2 sets the tiering: L3 for Salesforce and HubSpot, L2
 * for Zoho and Pipedrive, **L1 for everything else** — and everything else
 * includes the in-house systems, which in this market is most of them.
 *
 * L3 on eight CRMs is a permanent team maintaining somebody else's APIs. L1
 * covers 100% of the market for 5% of the effort, and it is what lets a
 * salesperson answer "does it work with ours?" with yes instead of a
 * roadmap.
 *
 * The declaration below is deliberately, almost embarrassingly small. That
 * honesty is the feature: `availableSurfaces()` reads these capabilities to
 * decide what renders, so a tenant on this adapter never sees a pipeline
 * view, never sees a bulk import button, and never sees a control that is
 * going to fail. **We do not show a button that is going to fail** — and the
 * way that survives contact with a CRM we have never heard of is by
 * declaring almost nothing and letting the UI shrink to fit.
 */

import type { AdapterCapabilities } from "../adapter.ts";
import type { BindingConfig } from "../binding.ts";

/**
 * What is true of every web CRM, and nothing more.
 *
 * `note` is the only writable entity. A note is a text field on the record
 * the agent already has open — the one thing every CRM ever built has, from
 * Salesforce down to a PHP form somebody's cousin wrote in 2011. Everything
 * beyond that is a per-CRM promise we are not in a position to make.
 */
export const UNIVERSAL_L1_CAPABILITIES: AdapterCapabilities = Object.freeze<AdapterCapabilities>({
  provider: "universal-overlay",
  level: "overlay",
  entities: ["note"],
  writable: ["note.body"],
  readable: [],
  webhooks: false,
  customFields: false,
  /**
   * No. And this is the honest cost of the tier.
   *
   * An inbound call rings and we cannot say who it is, because there is no
   * API to ask. The agent sees the screen the CRM gives them, and VoicePilot
   * binds to whatever record they open. Everything the copilot does — the
   * transcript, the accent conversion, the compliance watch — works
   * regardless. Only the pre-answer lookup is lost.
   */
  resolveByPhone: false,
  /**
   * Unknown, per CRM, and it must stay unknown rather than default to false.
   *
   * `docs/13` is the whole argument: if the CRM's dialer owns the audio path,
   * our media plane cannot sit in the SIP path, and the difference between
   * those two worlds is a weekend of work or a quarter. Assuming the
   * comfortable answer here is how that discovery gets made after the
   * contract is signed.
   */
  ownsAudioPath: false,
  supportsCustomSipTrunk: "unknown",
});

/**
 * The starting config for a CRM we have never seen.
 *
 * Empty on purpose. With no rules, `detect()` returns `none` and the panel
 * asks the agent which record they are on — rung (d) of the cascade, which
 * always works. Onboarding a new CRM then means adding a URL rule and
 * watching the agent stop being asked.
 *
 * The alternative — shipping speculative selectors like `#leadId, .record-id`
 * and hoping — is the failure `providers/readymode.ts` refuses by using
 * `UNKNOWN`: a plausible wrong selector produces a binding that looks right
 * and writes to the wrong record.
 */
export const UNIVERSAL_BINDING_CONFIG: BindingConfig = Object.freeze<BindingConfig>({
  provider: "universal-overlay",
  version: 1,
  rules: [],
});

/**
 * What a new CRM needs before it is more than "ask the agent every time".
 *
 * Returned as a list rather than a boolean so onboarding is a checklist
 * somebody can work through, in the same shape as
 * `readymode.integrationReadiness()`.
 */
export function onboardingChecklist(config: BindingConfig): string[] {
  const missing: string[] = [];
  const hasUrlRule = config.rules.some((r) => r.urlPattern);
  const hasAttrRule = config.rules.some((r) => r.attribute);

  if (!hasUrlRule) {
    missing.push(
      "A URL pattern for at least one record type. Open a lead and copy the " +
        "address bar — this is 10 minutes of work and removes the agent from " +
        "the loop entirely.",
    );
  }
  if (!hasUrlRule && !hasAttrRule) {
    missing.push(
      "Some automatic binding. With neither a URL pattern nor a data " +
        "attribute, every call starts with the agent picking the record.",
    );
  }
  if (!config.rules.some((r) => r.hostSuffix)) {
    missing.push(
      "A host suffix per rule, so the extension activates only on the " +
        "tenant's own CRM domain and nowhere else.",
    );
  }
  return missing;
}
