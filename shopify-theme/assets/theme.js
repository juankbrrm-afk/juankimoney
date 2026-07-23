(function () {
  "use strict";

  var body = document.body;
  var header = document.querySelector(".site-header");
  var isHome = body.dataset.template === "index";

  /* ---------------- Header solid-on-scroll ---------------- */
  function updateHeaderState() {
    if (!header) return;
    if (!isHome) {
      header.classList.add("is-solid");
      return;
    }
    var threshold = window.innerHeight * 0.8;
    header.classList.toggle("is-solid", window.scrollY > threshold || body.classList.contains("menu-open"));
  }
  window.addEventListener("scroll", updateHeaderState, { passive: true });
  updateHeaderState();

  /* ---------------- Menu drawer ---------------- */
  var menuBtn = document.querySelector("[data-menu-toggle]");
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      body.classList.toggle("menu-open");
      body.classList.remove("search-open");
      updateHeaderState();
    });
  }
  document.querySelectorAll("[data-menu-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      body.classList.remove("menu-open");
      updateHeaderState();
    });
  });

  /* ---------------- Search drawer ---------------- */
  var searchBtn = document.querySelector("[data-search-toggle]");
  if (searchBtn) {
    searchBtn.addEventListener("click", function () {
      body.classList.toggle("search-open");
      body.classList.remove("menu-open");
      updateHeaderState();
      if (body.classList.contains("search-open")) {
        var input = document.querySelector(".search-drawer__field input");
        if (input) setTimeout(function () { input.focus(); }, 50);
      }
    });
  }
  document.querySelectorAll("[data-search-close]").forEach(function (el) {
    el.addEventListener("click", function () { body.classList.remove("search-open"); });
  });

  /* ---------------- Cart drawer (Shopify AJAX Cart API) ---------------- */
  var cartDrawer = document.querySelector("[data-cart-drawer]");
  var cartBackdrop = document.querySelector("[data-cart-backdrop]");

  function openCart() {
    if (cartDrawer) cartDrawer.classList.add("is-open");
    if (cartBackdrop) cartBackdrop.classList.add("is-open");
  }
  function closeCart() {
    if (cartDrawer) cartDrawer.classList.remove("is-open");
    if (cartBackdrop) cartBackdrop.classList.remove("is-open");
  }
  document.querySelectorAll("[data-cart-toggle]").forEach(function (el) {
    el.addEventListener("click", openCart);
  });
  document.querySelectorAll("[data-cart-close]").forEach(function (el) {
    el.addEventListener("click", closeCart);
  });
  if (cartBackdrop) cartBackdrop.addEventListener("click", closeCart);

  function renderCartCount(count) {
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = count > 0 ? " (" + count + ")" : "";
    });
  }

  function money(cents) {
    return "$" + Math.round(cents / 100);
  }

  function cartLineHtml(line) {
    var img = line.image || "";
    var meta = (line.variant_options || []).filter(function (o) { return o && o !== "Default Title"; }).join(" · ");
    return (
      '<li class="cart-line">' +
      '<img class="cart-line__image" src="' + img + '" alt="" loading="lazy">' +
      '<div class="cart-line__body">' +
      '<div class="cart-line__top">' +
      "<div>" +
      '<p class="cart-line__name">' + line.product_title + "</p>" +
      (meta ? '<p class="cart-line__meta">' + meta + "</p>" : "") +
      "</div>" +
      '<p class="cart-line__price">' + money(line.final_line_price) + "</p>" +
      "</div>" +
      '<div class="cart-line__controls">' +
      '<div class="qty-stepper">' +
      '<button type="button" data-cart-qty-minus="' + line.key + '" data-cursor-hover>−</button>' +
      '<span data-cart-qty-value="' + line.key + '">' + line.quantity + "</span>" +
      '<button type="button" data-cart-qty-plus="' + line.key + '" data-cursor-hover>+</button>' +
      "</div>" +
      '<button type="button" class="cart-line__remove" data-cart-remove="' + line.key + '" data-cursor-hover>Remove</button>' +
      "</div>" +
      "</div>" +
      "</li>"
    );
  }

  function renderCart(cart) {
    var inner = document.querySelector("[data-cart-drawer-inner]");
    if (!inner) return;

    if (!cart.items.length) {
      inner.innerHTML =
        '<div class="cart-drawer__empty">' +
        "<h3>" + (window.MONEA_I18N ? window.MONEA_I18N.emptyHeading : "Your wardrobe is waiting.") + "</h3>" +
        "<p>" + (window.MONEA_I18N ? window.MONEA_I18N.emptyBody : "") + "</p>" +
        '<a href="' + (window.MONEA_I18N ? window.MONEA_I18N.shopUrl : "/collections/all") + '" class="btn-outline" data-cart-close data-cursor-hover>Continue Shopping</a>' +
        "</div>";
    } else {
      var linesHtml = cart.items.map(cartLineHtml).join("");
      inner.innerHTML =
        '<ul class="cart-drawer__lines">' + linesHtml + "</ul>" +
        '<div class="cart-drawer__foot">' +
        '<div class="cart-drawer__subtotal"><span>Subtotal</span><span>' + money(cart.total_price) + "</span></div>" +
        '<a href="/checkout" class="btn-checkout" data-cursor-hover>Checkout</a>' +
        '<button type="button" class="btn-continue" data-cart-close data-cursor-hover>Continue Shopping</button>' +
        "</div>";
      bindCartControls();
    }
    renderCartCount(cart.item_count);
  }

  function refreshCartDrawer() {
    fetch("/cart.js")
      .then(function (res) { return res.json(); })
      .then(renderCart)
      .catch(function () {});
  }

  function bindCartControls() {
    document.querySelectorAll("[data-cart-remove]").forEach(function (el) {
      el.addEventListener("click", function () {
        updateLine(el.getAttribute("data-cart-remove"), 0);
      });
    });
    document.querySelectorAll("[data-cart-qty-minus]").forEach(function (el) {
      el.addEventListener("click", function () {
        var key = el.getAttribute("data-cart-qty-minus");
        var qtyEl = document.querySelector('[data-cart-qty-value="' + key + '"]');
        var qty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
        updateLine(key, Math.max(0, qty - 1));
      });
    });
    document.querySelectorAll("[data-cart-qty-plus]").forEach(function (el) {
      el.addEventListener("click", function () {
        var key = el.getAttribute("data-cart-qty-plus");
        var qtyEl = document.querySelector('[data-cart-qty-value="' + key + '"]');
        var qty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
        updateLine(key, qty + 1);
      });
    });
  }

  function updateLine(key, quantity) {
    fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: key, quantity: quantity }),
    })
      .then(function (res) { return res.json(); })
      .then(renderCart)
      .catch(function () {});
  }

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.matches('form[action^="/cart/add"]')) return;
    e.preventDefault();
    var formData = new FormData(form);
    fetch("/cart/add.js", { method: "POST", body: formData })
      .then(function (res) { return res.json(); })
      .then(function () {
        openCart();
        refreshCartDrawer();
      })
      .catch(function () {});
  });

  bindCartControls();

  /* ---------------- Custom cursor ---------------- */
  if (window.matchMedia("(pointer: fine)").matches) {
    var dot = document.createElement("div");
    dot.className = "cursor-dot";
    var ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var target = { x: 0, y: 0 };
    var ringPos = { x: 0, y: 0 };

    window.addEventListener("pointermove", function (e) {
      target.x = e.clientX;
      target.y = e.clientY;
      dot.style.transform = "translate3d(" + e.clientX + "px," + e.clientY + "px,0) translate(-50%,-50%)";
      var hovering = e.target.closest("a, button, [data-cursor-hover]");
      ring.style.width = hovering ? "56px" : "28px";
      ring.style.height = hovering ? "56px" : "28px";
      ring.style.opacity = hovering ? "0.5" : "0.3";
    });

    function tick() {
      ringPos.x += (target.x - ringPos.x) * 0.16;
      ringPos.y += (target.y - ringPos.y) * 0.16;
      ring.style.transform = "translate3d(" + ringPos.x + "px," + ringPos.y + "px,0) translate(-50%,-50%)";
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- Reveal on scroll ---------------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var children = entry.target.children;
            for (var i = 0; i < children.length; i++) {
              (function (el, idx) {
                setTimeout(function () { el.classList.add("is-visible"); }, idx * 90);
              })(children[i], i);
            }
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealEls.forEach(function (el) {
      Array.prototype.forEach.call(el.children, function (child) { child.classList.add("reveal"); });
      io.observe(el);
    });
  }

  /* ---------------- Hero entrance ---------------- */
  var hero = document.querySelector(".hero");
  if (hero) {
    requestAnimationFrame(function () {
      setTimeout(function () { hero.classList.add("is-ready"); }, 300);
    });
  }

  /* ---------------- Loading screen ---------------- */
  var loadingScreen = document.querySelector(".loading-screen");
  if (loadingScreen) {
    requestAnimationFrame(function () {
      setTimeout(function () { loadingScreen.classList.add("is-ready"); }, 50);
      setTimeout(function () { loadingScreen.classList.add("is-done"); }, 1500);
      setTimeout(function () { loadingScreen.remove(); }, 2600);
    });
  }

  /* ---------------- Collection-reveal pinned scroll sequence ---------------- */
  var reveal = document.querySelector("[data-collection-reveal]");
  if (reveal) {
    var panel = reveal.querySelector("[data-reveal-panel]");
    var items = reveal.querySelectorAll("[data-reveal-item]");
    var cta = reveal.querySelector("[data-reveal-cta]");
    var ticking = false;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var rect = reveal.getBoundingClientRect();
        var vh = window.innerHeight;
        var total = rect.height - vh;
        var progress = clamp((-rect.top) / total, 0, 1);

        var panelIn = clamp(progress / 0.25, 0, 1);
        var itemsIn = clamp((progress - 0.2) / 0.35, 0, 1);
        var panelOut = clamp((progress - 0.65) / 0.3, 0, 1);

        var panelY = 100 - panelIn * 100 + panelOut * -100;
        if (panel) panel.style.transform = "translateY(" + panelY + "%)";

        items.forEach(function (item, i) {
          var stagger = i * 0.06;
          var p = clamp((itemsIn - stagger) / (1 - stagger), 0, 1);
          item.style.opacity = String(p);
          item.style.transform = "translateY(" + (1 - p) * 56 + "px) scale(" + (0.94 + p * 0.06) + ")";
        });

        if (cta) {
          cta.style.opacity = String(panelOut);
          cta.style.transform = "translateY(" + (1 - panelOut) * 24 + "px)";
        }

        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- Accordion ---------------- */
  document.querySelectorAll(".accordion-item__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".accordion-item");
      var wasOpen = item.classList.contains("is-open");
      item.parentElement.querySelectorAll(".accordion-item").forEach(function (i) { i.classList.remove("is-open"); });
      if (!wasOpen) item.classList.add("is-open");
    });
  });

  /* ---------------- Wishlist (localStorage) ---------------- */
  function getWishlist() {
    try { return JSON.parse(localStorage.getItem("monea_wishlist") || "[]"); } catch (e) { return []; }
  }
  function setWishlist(list) {
    localStorage.setItem("monea_wishlist", JSON.stringify(list));
  }
  function paintWishlistButtons() {
    var list = getWishlist();
    document.querySelectorAll("[data-wishlist-toggle]").forEach(function (btn) {
      var id = btn.getAttribute("data-wishlist-toggle");
      var active = list.indexOf(id) !== -1;
      btn.setAttribute("data-active", active ? "true" : "false");
      btn.textContent = active ? "♥" : "♡";
    });
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-wishlist-toggle]");
    if (!btn) return;
    var id = btn.getAttribute("data-wishlist-toggle");
    var list = getWishlist();
    var idx = list.indexOf(id);
    if (idx === -1) list.push(id); else list.splice(idx, 1);
    setWishlist(list);
    paintWishlistButtons();
  });
  paintWishlistButtons();

  /* ---------------- Product variant picker ---------------- */
  document.querySelectorAll(".product-form").forEach(function (formEl) {
    var variantsJson = formEl.querySelector("[data-variants-json]");
    if (!variantsJson) return;
    var variants = JSON.parse(variantsJson.textContent);
    var idInput = formEl.querySelector('input[name="id"]');
    var priceEl = formEl.querySelector("[data-variant-price]");
    var compareEl = formEl.querySelector("[data-variant-compare]");
    var submitBtn = formEl.querySelector('[type="submit"]');

    function selectedOptions() {
      var opts = [];
      formEl.querySelectorAll("[data-option-index]").forEach(function (group) {
        var index = parseInt(group.getAttribute("data-option-index"), 10);
        var active = group.querySelector('.swatch[data-selected="true"]');
        opts[index] = active ? active.getAttribute("data-option-value") : null;
      });
      return opts;
    }

    function matchVariant() {
      var opts = selectedOptions();
      return variants.find(function (v) {
        var vOpts = [v.option1, v.option2, v.option3];
        return opts.every(function (val, i) { return val == null || vOpts[i] === val; });
      });
    }

    function updateFromVariant() {
      var variant = matchVariant();
      if (!variant) return;
      if (idInput) idInput.value = variant.id;
      if (priceEl) priceEl.textContent = formatMoney(variant.price);
      if (compareEl) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          compareEl.textContent = formatMoney(variant.compare_at_price);
          compareEl.style.display = "";
        } else {
          compareEl.style.display = "none";
        }
      }
      if (submitBtn) {
        submitBtn.disabled = !variant.available;
        submitBtn.textContent = variant.available ? submitBtn.getAttribute("data-label-available") : submitBtn.getAttribute("data-label-soldout");
      }
    }

    function formatMoney(cents) {
      return "$" + (cents / 100).toFixed(0);
    }

    formEl.querySelectorAll(".swatch").forEach(function (swatch) {
      swatch.addEventListener("click", function () {
        var group = swatch.closest("[data-option-index]");
        group.querySelectorAll(".swatch").forEach(function (s) { s.setAttribute("data-selected", "false"); });
        swatch.setAttribute("data-selected", "true");
        updateFromVariant();
      });
    });

    var qtyInput = formEl.querySelector('[data-qty-input]');
    var qtyMinus = formEl.querySelector('[data-qty-minus]');
    var qtyPlus = formEl.querySelector('[data-qty-plus]');
    if (qtyMinus) qtyMinus.addEventListener("click", function () {
      qtyInput.value = Math.max(1, parseInt(qtyInput.value || "1", 10) - 1);
    });
    if (qtyPlus) qtyPlus.addEventListener("click", function () {
      qtyInput.value = parseInt(qtyInput.value || "1", 10) + 1;
    });

    updateFromVariant();
  });

  /* ---------------- Predictive search ---------------- */
  var searchInput = document.querySelector("[data-search-input]");
  var searchResults = document.querySelector("[data-search-results]");
  if (searchInput && searchResults) {
    var searchTimer = null;
    searchInput.addEventListener("input", function () {
      var q = searchInput.value.trim();
      clearTimeout(searchTimer);
      if (!q) { searchResults.innerHTML = ""; return; }
      searchTimer = setTimeout(function () {
        fetch("/search/suggest.json?q=" + encodeURIComponent(q) + "&resources[type]=product&resources[limit]=6&resources[options][unavailable_products]=last")
          .then(function (res) { return res.json(); })
          .then(function (data) {
            var products = (data.resources && data.resources.results && data.resources.results.products) || [];
            if (!products.length) {
              searchResults.innerHTML = '<p style="grid-column:1/-1;font-size:14px;color:var(--color-warmgray)">' + (window.MONEA_I18N ? window.MONEA_I18N.noResults : "Nothing found.") + "</p>";
              return;
            }
            searchResults.innerHTML = products
              .map(function (p) {
                var img = p.featured_image ? p.featured_image.url : "";
                return (
                  '<a href="' + p.url + '" data-cursor-hover data-search-close>' +
                  '<div class="editorial-image editorial-image--45">' +
                  (img ? '<img src="' + img + '" alt="" loading="lazy">' : "") +
                  "</div>" +
                  '<p class="product-card__name" style="margin-top:12px">' + p.title + "</p>" +
                  '<p class="product-card__price">' + p.price + "</p>" +
                  "</a>"
                );
              })
              .join("");
            searchResults.querySelectorAll("[data-search-close]").forEach(function (el) {
              el.addEventListener("click", function () { body.classList.remove("search-open"); });
            });
          })
          .catch(function () {});
      }, 220);
    });
  }

  /* ---------------- Size guide modal ---------------- */
  document.querySelectorAll("[data-size-guide-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var modal = document.querySelector("[data-size-guide-modal]");
      if (modal) modal.classList.add("is-open");
    });
  });
  document.querySelectorAll("[data-size-guide-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var modal = document.querySelector("[data-size-guide-modal]");
      if (modal) modal.classList.remove("is-open");
    });
  });
})();
