(function () {
  document.documentElement.classList.add('js');

  /* Announcement rotation */
  document.querySelectorAll('[data-announcement]').forEach(function (bar) {
    var msgs = bar.querySelectorAll('.announcement__msg');
    if (msgs.length < 2) return;
    var i = 0;
    setInterval(function () {
      msgs[i].classList.remove('is-active');
      i = (i + 1) % msgs.length;
      msgs[i].classList.add('is-active');
    }, 4200);
  });

  /* Drawers */
  function toggleDrawer(el, open) {
    if (!el) return;
    el.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      var input = el.querySelector('input[type="search"]');
      if (input) setTimeout(function () { input.focus(); }, 50);
    }
  }
  var menu = document.getElementById('MenuDrawer');
  var search = document.getElementById('SearchDrawer');
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-menu-open]')) toggleDrawer(menu, true);
    if (e.target.closest('[data-menu-close]')) toggleDrawer(menu, false);
    if (e.target.closest('[data-search-open]')) toggleDrawer(search, true);
    if (e.target.closest('[data-search-close]')) toggleDrawer(search, false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { toggleDrawer(menu, false); toggleDrawer(search, false); }
  });

  /* Product gallery */
  document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
    var track = gallery.querySelector('[data-gallery-slides]');
    if (!track) return;
    var slides = track.children;
    var thumbs = gallery.querySelectorAll('[data-gallery-thumb]');
    var dots = gallery.querySelectorAll('.gallery__dot');
    function current() { return Math.round(track.scrollLeft / track.clientWidth); }
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    }
    function sync() {
      var i = current();
      thumbs.forEach(function (t, n) { t.classList.toggle('is-active', n === i); });
      dots.forEach(function (d, n) { d.classList.toggle('is-active', n === i); });
    }
    track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
    thumbs.forEach(function (t) { t.addEventListener('click', function () { go(+t.dataset.galleryThumb); }); });
    var prev = gallery.querySelector('[data-gallery-prev]');
    var next = gallery.querySelector('[data-gallery-next]');
    if (prev) prev.addEventListener('click', function () { go(current() - 1); });
    if (next) next.addEventListener('click', function () { go(current() + 1); });
  });

  /* Variant picker */
  document.querySelectorAll('[data-product-section]').forEach(function (section) {
    var jsonEl = section.parentNode.querySelector('[data-product-json]');
    if (!jsonEl) return;
    var data;
    try { data = JSON.parse(jsonEl.textContent); } catch (err) { return; }
    var inputs = section.querySelectorAll('[data-option-input]');
    if (!inputs.length) return;

    function selected() {
      var opts = [];
      inputs.forEach(function (input) { if (input.checked) opts[+input.dataset.optionInput] = input.value; });
      return opts;
    }
    function update() {
      var opts = selected();
      inputs.forEach(function (input) {
        input.closest('.variant-card').classList.toggle('is-selected', input.checked);
      });
      section.querySelectorAll('[data-option-label]').forEach(function (label) {
        label.textContent = opts[+label.dataset.optionLabel] || '';
      });
      var variant = data.variants.find(function (v) {
        return v.options.every(function (o, n) { return o === opts[n]; });
      });
      if (!variant) return;
      document.querySelectorAll('[data-variant-id]').forEach(function (el) { el.value = variant.id; });
      document.querySelectorAll('.product__price .price, .sticky-buy .price').forEach(function (price) {
        var cur = price.querySelector('.price__current');
        var cmp = price.querySelector('.price__compare');
        var badge = price.querySelector('.badge');
        if (cur) cur.textContent = variant.price;
        if (cmp) { cmp.textContent = variant.compare || ''; cmp.hidden = !variant.compare; }
        if (badge) { badge.textContent = 'Save ' + variant.save + '%'; badge.hidden = !variant.save; }
      });
      var add = section.querySelector('[data-add-button]');
      if (add) { add.disabled = !variant.available; add.textContent = variant.available ? 'Add to cart' : 'Sold out'; }
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
    }
    inputs.forEach(function (input) { input.addEventListener('change', update); });
  });

  /* Quantity */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-qty]');
    if (!btn) return;
    var input = btn.parentNode.querySelector('input');
    input.value = Math.max(1, (+input.value || 1) + (+btn.dataset.qty));
  });

  /* Sticky buy bar */
  var sticky = document.querySelector('[data-sticky-buy]');
  var buy = document.querySelector('.product__buy');
  if (sticky && buy && 'IntersectionObserver' in window) {
    document.body.classList.add('has-sticky-buy');
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      sticky.hidden = e.isIntersecting || e.boundingClientRect.top > 0;
    }).observe(buy);
  }

  /* Reveal sections on scroll */
  if ('IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.section .section-head, .card, .feature, .step, .review, .iwt__media, .iwt__content, .compare__table, .highlights__media');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach(function (t, i) {
      t.classList.add('reveal');
      t.style.transitionDelay = (i % 4) * 70 + 'ms';
      io.observe(t);
    });
  }
})();
