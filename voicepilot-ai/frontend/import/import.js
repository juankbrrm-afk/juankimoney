/**
 * The import review.
 *
 * `plan()` decided every action on this page. This file renders them and
 * tracks which review rows a person has resolved — which is the only state
 * it owns, and it owns it because resolving is a human act that has not
 * happened yet, not because the rule lives here.
 *
 * Note what is deliberately absent: there is no code path that turns a
 * `review` into a `merge` on its own. The reviewer picks, or the row is
 * created as a new contact. A screen that could quietly promote a review to a
 * merge would reintroduce exactly the failure `dedupe.ts` refuses — a
 * confident wrong answer about whether two people are one person.
 */

const $ = (id) => document.getElementById(id);

const state = {
  data: null,
  /** row number -> what the reviewer chose. */
  resolved: new Map(),
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const BASIS_LABEL = {
  phone: "mismo teléfono",
  email: "mismo email",
  name_company: "mismo nombre y empresa",
  name_only: "solo el nombre",
};

/**
 * The review reasons, in the product's language.
 *
 * Keyed by `ReviewCode`, never by the prose. `dedupe.ts` carries both: a
 * stable code and an English sentence written for whoever is reading a log.
 * Switching on the sentence breaks the moment somebody improves the wording,
 * and rendering it directly ships English into a Spanish product — which is
 * exactly what this screen did before the code existed.
 */
const REVIEW_REASON = {
  existing_duplicates:
    "Esta fila coincide con dos contactos distintos por identificadores " +
    "fuertes. Los registros que ya están en el CRM son probablemente " +
    "duplicados entre sí, y fusionar con uno deja al otro huérfano.",
  external_id_conflict:
    "Los dos registros llevan ids distintos en el mismo sistema externo. " +
    "Allí son dos personas; unirlos aquí haría que nuestros datos y los " +
    "suyos discrepen para siempre.",
  name_and_company:
    "Mismo nombre y misma empresa. Es plausible — y un nombre no es un " +
    "identificador.",
  name_only:
    "Coincide solo el nombre. Los nombres no son identificadores.",
};

const FIELD_LABEL = {
  firstName: "nombre",
  lastName: "apellido",
  company: "empresa",
  email: "email",
  phoneE164: "teléfono",
  timezone: "zona horaria",
  country: "país",
  dncReason: "motivo DNC",
  doNotCall: "no llamar",
};

function fieldLabel(field) {
  if (FIELD_LABEL[field]) return FIELD_LABEL[field];
  // `consent.sms`, `externalIds.conn-sf`, `customFields.x` come through as
  // dotted paths. Shown as-is: inventing a friendly name for a tenant's own
  // custom field is how a reviewer ends up approving a change to something
  // other than what they think.
  return field;
}

function show(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (v === true) return "sí";
  if (v === false) return "no";
  return String(v);
}

/* ---------------------------------------------------------------------- */
/* Review                                                                  */
/* ---------------------------------------------------------------------- */

function candidateCard(c, incoming) {
  const node = el("div", "candidate");
  node.dataset.incoming = incoming ? "yes" : "no";

  const head = el("div", "candidate__head");
  head.append(el("span", "candidate__who", c.name));
  head.append(el("span", "candidate__src", incoming ? "del archivo" : "en el CRM"));
  node.append(head);

  for (const [k, v] of Object.entries(c.fields)) {
    if (v === undefined || v === null || v === "") continue;
    const row = el("div", "field");
    row.append(el("span", "field__k", fieldLabel(k)));
    row.append(el("span", "", show(v)));
    node.append(row);
  }

  if (!incoming) {
    const basis = el("span", "basis");
    basis.dataset.auto = c.autoMergeable ? "yes" : "no";
    basis.append(el("span", "", BASIS_LABEL[c.basis] ?? c.basis));
    basis.append(el("span", "basis__n num", c.confidence.toFixed(2)));

    // `Element.append()` returns undefined, so the wrapper has to be held in
    // a variable rather than chained off the append that inserts it.
    const wrap = el("div");
    wrap.style.marginTop = "var(--s2)";
    wrap.append(basis);
    node.append(wrap);
  }
  return node;
}

function renderReview(d) {
  const node = el("article", "review");
  node.dataset.row = String(d.row);
  node.dataset.resolved = "no";

  const top = el("div", "review__top");
  top.append(el("span", "review__row", `fila ${d.row}`));
  top.append(el("span", "review__name", d.name));
  node.append(top);
  // Falls back to the engine's English sentence rather than to nothing: an
  // untranslated code is a missing string, and a blank reason would turn it
  // into a review card that does not say why it exists.
  node.append(el("p", "review__reason", REVIEW_REASON[d.code] ?? d.reason));

  const grid = el("div", "candidates");
  grid.append(
    candidateCard(
      {
        name: d.name,
        fields: {
          company: d.incoming.company,
          email: d.incoming.email,
          phoneE164: d.incoming.phoneE164,
          ...(d.incoming.externalIds ?? {}),
        },
      },
      true,
    ),
  );
  for (const c of d.candidates) {
    grid.append(
      candidateCard(
        {
          ...c,
          fields: { company: c.company, id: c.id },
        },
        false,
      ),
    );
  }
  node.append(grid);

  const actions = el("div", "actions");

  for (const c of d.candidates) {
    const b = el("button", "", `Es ${c.name} (${c.id})`);
    b.type = "button";
    b.dataset.primary = "";
    b.dataset.choose = c.id;
    b.addEventListener("click", () =>
      resolve(node, d.row, `fusionada con ${c.name} · ${c.id}, elegido por una persona`),
    );
    actions.append(b);
  }

  const asNew = el("button", "", "Es otra persona — crear");
  asNew.type = "button";
  asNew.dataset.choose = "new";
  asNew.addEventListener("click", () =>
    resolve(node, d.row, "creada como contacto nuevo"),
  );
  actions.append(asNew);

  const skip = el("button", "", "Omitir esta fila");
  skip.type = "button";
  skip.dataset.choose = "skip";
  skip.addEventListener("click", () => resolve(node, d.row, "omitida"));
  actions.append(skip);

  node.append(actions);
  return node;
}

function resolve(node, row, note) {
  state.resolved.set(row, note);
  node.dataset.resolved = "yes";
  node.querySelector(".actions").replaceWith(
    el("p", "resolved-note", `Resuelta: ${note}.`),
  );
  refreshApply();
}

/* ---------------------------------------------------------------------- */
/* Merge previews                                                          */
/* ---------------------------------------------------------------------- */

function renderMerge(d) {
  const node = el("article", "merge");
  node.dataset.row = String(d.row);

  const top = el("div", "merge__top");
  top.append(el("span", "review__row", `fila ${d.row}`));
  top.append(el("span", "merge__name", d.name));

  const basis = el("span", "basis");
  basis.dataset.auto = "yes";
  basis.append(el("span", "", BASIS_LABEL[d.basis] ?? d.basis));
  basis.append(el("span", "basis__n num", d.confidence.toFixed(2)));
  top.append(basis);
  node.append(top);

  const list = el("ul", "changes");
  for (const c of d.changes) {
    const li = el("li", "change");
    li.append(el("span", "change__field", fieldLabel(c.field)));
    li.append(el("span", "", `${show(c.from)} →`));
    li.append(el("span", "change__to", show(c.to)));
    list.append(li);
  }

  // What the file wanted and did not get. Listed, never dropped: a phone
  // number that vanished silently is the one nobody can find again.
  for (const c of d.discarded) {
    const li = el("li", "change");
    li.dataset.discarded = "";
    li.append(el("span", "change__field", fieldLabel(c.field)));
    li.append(el("span", "change__to", show(c.from)));
    li.append(el("span", "change__kept", `· se mantiene ${show(c.to)}`));
    list.append(li);
  }

  if (d.changes.length === 0 && d.discarded.length === 0) {
    list.append(el("li", "change", "Sin cambios: el archivo no aporta nada nuevo."));
  }

  node.append(list);
  return node;
}

/* ---------------------------------------------------------------------- */
/* Apply bar                                                               */
/* ---------------------------------------------------------------------- */

/**
 * The bar reflects `plan()`'s verdict plus what the reviewer has resolved.
 *
 * `cleanlyApplicable` is false whenever one row needs a person — the common
 * case for a real list, and the correct outcome. A dry run that always ends
 * in "looks fine, apply" is theatre.
 */
function refreshApply() {
  const total = state.data.counts.review;
  const done = state.resolved.size;
  const ready = done === total;

  $("apply").disabled = !ready;
  $("apply-state").textContent = ready
    ? total === 0
      ? `${state.data.counts.create} nuevos y ${state.data.counts.merge} fusiones. ` +
        "Nada quedó pendiente de decisión."
      : `${done} de ${total} resueltas. Listo para aplicar.`
    : `${total - done} fila${total - done === 1 ? "" : "s"} sin resolver. ` +
      "La importación no se aplica hasta que alguien decida.";

  $("t-review").textContent = String(total - done);
  $("t-review").closest(".tally__item").dataset.any = total - done > 0 ? "yes" : "no";
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

function renderSuppression(s) {
  if (!s) return;
  $("suppression").hidden = false;
  $("supp-headline").textContent =
    `Se mantuvo la supresión de ${s.name} (${s.phone}).`;
  $("supp-detail").textContent =
    `El archivo traía "no llamar: ${s.fileSaid ? "sí" : "no"}" y el CRM tiene ` +
    `"${s.reason}". Una marca de no-llamar no se borra con una importación: ` +
    "bajo la TCPA una llamada a un número suprimido son $500–$1.500 por " +
    "llamada, y una fusión es justo la operación que lo borraría a escala y " +
    "sin dejar rastro.";
}

async function boot() {
  const data = await (await fetch("plan.json")).json();
  state.data = data;

  $("file").textContent = `${data.file.name} · ${data.file.rows} filas`;
  $("t-merge").textContent = String(data.counts.merge);
  $("t-create").textContent = String(data.counts.create);

  renderSuppression(data.suppression);

  const reviews = data.decisions.filter((d) => d.action === "review");
  const merges = data.decisions.filter((d) => d.action === "merge");
  const creates = data.decisions.filter((d) => d.action === "create");

  $("review-section").hidden = reviews.length === 0;
  $("reviews").replaceChildren(...reviews.map(renderReview));

  $("merge-section").hidden = merges.length === 0;
  $("merges").replaceChildren(...merges.map(renderMerge));

  $("create-section").hidden = creates.length === 0;
  $("creates").replaceChildren(
    ...creates.map((d) => {
      const row = el("div", "create");
      row.append(el("span", "create__row", String(d.row)));
      row.append(el("span", "", d.name));
      row.append(el("span", "create__id", d.incoming.phoneE164 ?? d.incoming.email ?? "sin identificador"));
      return row;
    }),
  );

  $("apply").addEventListener("click", () => {
    $("apply").disabled = true;
    $("apply").textContent = "Aplicada";
    $("apply-state").textContent =
      "En producción esto encola las escrituras en la cola idempotente de " +
      "shared/crm. Aquí no escribe nada.";
  });

  refreshApply();
  document.body.dataset.ready = "yes";
}

boot();
