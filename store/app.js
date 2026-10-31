(function () {
  const S = window.STORE;
  const KEY = "stillwag-cart-v1";
  const $ = (s, r = document) => r.querySelector(s);
  const money = n => "$" + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "");

  // ---------- cart state ----------
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { cart = []; }
  cart = cart.filter(l => S.products[l.id] && l.qty > 0);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };

  const unitPrice = l => S.products[l.id].price * (l.sub ? 1 - S.subscribeDiscount : 1);
  const subtotal = () => cart.reduce((t, l) => t + unitPrice(l) * l.qty, 0);
  const count = () => cart.reduce((t, l) => t + l.qty, 0);

  function add(id, qty = 1, sub = false) {
    const ex = cart.find(l => l.id === id && !!l.sub === !!sub);
    ex ? (ex.qty += qty) : cart.push({ id, qty, sub: !!sub });
    save(); render();
  }
  function setQty(i, q) { q <= 0 ? cart.splice(i, 1) : (cart[i].qty = q); save(); render(); }

  // ---------- drawer ----------
  function render() {
    document.querySelectorAll("[data-cart-count]").forEach(el => { el.textContent = count(); el.dataset.n = count(); });
    const lines = $("#cart-lines");
    if (!lines) return;
    const sub = subtotal();
    const left = Math.max(0, S.freeShippingAt - sub);
    const ship = $("#cart-ship");
    ship.classList.toggle("done", left === 0);
    $("#ship-text").innerHTML = left === 0 ? "You've got <b>free shipping</b>." : `You're ${money(left)} away from free shipping.`;
    $("#ship-fill").style.width = Math.min(100, (sub / S.freeShippingAt) * 100) + "%";

    lines.innerHTML = cart.length ? cart.map((l, i) => {
      const p = S.products[l.id];
      return `<div class="line">
        <img src="${p.img}" alt="">
        <div><b>${p.name}</b><small>${p.sub}${l.sub ? " · Monthly, 15% off" : ""}</small>
          <div class="qty"><button data-dec="${i}" aria-label="Fewer">−</button><span>${l.qty}</span><button data-inc="${i}" aria-label="More">+</button></div>
        </div>
        <div style="text-align:right"><b>${money(unitPrice(l) * l.qty)}</b><button class="rm" data-rm="${i}">Remove</button></div>
      </div>`;
    }).join("") : `<div class="empty">Your cart is empty.</div>`;

    const hasProbiotic = cart.some(l => l.id === "probiotic");
    $("#cart-upsell").style.display = cart.length && !hasProbiotic ? "grid" : "none";
    $("#cart-sub").textContent = money(sub);
    $("#cart-shipping").textContent = !cart.length ? "—" : left === 0 ? "Free" : money(5.95);
    $("#cart-total").textContent = money(cart.length ? sub + (left === 0 ? 0 : 5.95) : 0);
    $("#checkout-btn").disabled = !cart.length;
  }

  function openCart() { document.body.classList.add("cart-open"); }
  function closeCart() { document.body.classList.remove("cart-open"); }

  function checkout() {
    if (!cart.length) return;
    const ready = S.shopifyDomain && cart.every(l => S.products[l.id].shopifyVariant);
    if (ready) {
      const items = cart.map(l => `${S.products[l.id].shopifyVariant}:${l.qty}`).join(",");
      location.href = `https://${S.shopifyDomain}/cart/${items}`;
    } else {
      location.href = "checkout.html";
    }
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("button,a");
    if (!t) return;
    if (t.matches("[data-open-cart]")) { e.preventDefault(); openCart(); }
    else if (t.matches("[data-close-cart]")) closeCart();
    else if (t.dataset.inc) setQty(+t.dataset.inc, cart[+t.dataset.inc].qty + 1);
    else if (t.dataset.dec) setQty(+t.dataset.dec, cart[+t.dataset.dec].qty - 1);
    else if (t.dataset.rm) setQty(+t.dataset.rm, 0);
    else if (t.dataset.add) { add(t.dataset.add, 1, false); toast("Added to cart"); }
    else if (t.id === "checkout-btn") checkout();
  });
  $(".scrim") && $(".scrim").addEventListener("click", closeCart);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeCart(); });

  let tt;
  function toast(msg) {
    const el = $("#toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => el.classList.remove("show"), 1800);
  }

  // ---------- entrances ----------
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { rootMargin: "0px 0px -8% 0px" }) : null;
  document.querySelectorAll(".rise").forEach((el, i) => {
    const d = el.dataset.d; if (d) el.style.transitionDelay = d + "ms";
    io ? io.observe(el) : el.classList.add("in");
  });

  window.Cart = { add, openCart, toast, render, money, get lines() { return cart; }, subtotal, unitPrice, clear() { cart = []; save(); render(); } };
  render();
})();
