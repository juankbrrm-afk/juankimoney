/**
 * The panel, and what it refuses to claim.
 *
 * The binding cascade returns three outcomes and the panel shows three
 * different things, because collapsing them would undo the whole design.
 * `ambiguous` is not an error state to hide — it is the moment the system
 * asks a human rather than writing a call note onto the wrong customer.
 */

const record = document.getElementById("record");
const how = document.getElementById("how");
const ask = document.getElementById("ask");

const RUNG = {
  url: "por la dirección de la página",
  attribute: "por un atributo del registro",
  selector: "leído de la pantalla",
  agent: "confirmado por ti",
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "panel:binding") return;
  const d = msg.decision;
  ask.hidden = true;

  if (d.kind === "bound") {
    record.textContent = `${d.entity} · ${d.externalId}`;
    record.className = "v ok";
    how.textContent = RUNG[d.rung] ?? d.rung;
    if (!msg.canWrite) {
      // Confidence gates writing separately from display. A CSS selector is
      // good enough to point the copilot at a record and not good enough to
      // write to a customer's CRM unattended.
      how.textContent += " · confirma antes de escribir";
      ask.hidden = false;
    }
    return;
  }

  if (d.kind === "ambiguous") {
    record.textContent = "Hay más de un registro en pantalla";
    record.className = "v warn";
    how.textContent = "No adivinamos cuál. Dinos tú.";
    ask.hidden = false;
    return;
  }

  record.textContent = "Sin registro detectado";
  record.className = "v";
  how.textContent = "Abre un lead, o dinos cuál es.";
  ask.hidden = false;
});
