const productGrid = document.querySelector("#product-grid");
const emptyState = document.querySelector("#empty-state");
const catalogStatus = document.querySelector("#catalog-status");
const searchInput = document.querySelector("#product-search");
const productDialog = document.querySelector("#product-dialog");
const productDetail = document.querySelector("#product-detail");
const adminDialog = document.querySelector("#admin-dialog");
const adminContent = document.querySelector("#admin-content");
const toast = document.querySelector("#toast");
const themeToggle = document.querySelector("#theme-toggle");
const installToggle = document.querySelector("#install-toggle");
const cartToggle = document.querySelector("#cart-toggle");
const cartDialog = document.querySelector("#cart-dialog");
const cartItemsContainer = document.querySelector("#cart-items");
const cartCount = document.querySelector("#cart-count");
const cartTotal = document.querySelector("#cart-total");
const cartHint = document.querySelector("#cart-hint");
const cartCheckout = document.querySelector("#cart-checkout");
const imageViewerDialog = document.querySelector("#image-viewer-dialog");
const viewerImage = document.querySelector("#viewer-image");
const viewerCount = document.querySelector("#viewer-count");

let products = [];
let selectedCategory = "TODAS";
let whatsappNumber = "";
let cart = [];
let viewerImages = [];
let viewerImageIndex = 0;
let toastTimer;
let editingId = null;
let adminProducts = [];
let previewObjectUrls = [];
let imageUploadsEnabled = true;
let offlineCatalog = false;
let installPrompt = null;

const categoryLabels = {
  BERMUDA: "Bermuda",
  OVERSIZED: "Oversized",
  PERUANA: "Peruana",
};

try {
  const savedCart = JSON.parse(localStorage.getItem("thunder-catalog-cart") || "[]");
  if (Array.isArray(savedCart)) {
    cart = savedCart.filter((item) =>
      item
      && typeof item.productId === "string"
      && typeof item.size === "string"
      && Number.isInteger(item.quantity)
      && item.quantity > 0
      && item.quantity <= 99,
    );
  }
} catch (error) {
  console.warn("Não foi possível recuperar o carrinho salvo.", error);
}

function saveCart() {
  try {
    localStorage.setItem("thunder-catalog-cart", JSON.stringify(cart));
  } catch (error) {
    console.warn("Não foi possível salvar o carrinho.", error);
    showToast("Não foi possível salvar o carrinho neste navegador.", true);
  }
}

function renderCart() {
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  cartCount.textContent = String(itemCount);
  cartToggle.setAttribute("aria-label", `Abrir carrinho, ${itemCount} ${itemCount === 1 ? "item" : "itens"}`);

  let canCheckout = cart.length > 0;
  let totalKnown = cart.length > 0;
  let total = 0;

  cartItemsContainer.innerHTML = cart.length
    ? cart.map((item, index) => {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product || product.active === false) {
        canCheckout = false;
        totalKnown = false;
        return `
          <article class="cart-item cart-item-unavailable">
            <div class="cart-item-info">
              <strong>Peça indisponível</strong>
              <span>${escapeHtml(item.productId)} · Tamanho ${escapeHtml(item.size || "a combinar")}</span>
            </div>
            <button class="cart-remove" type="button" data-cart-remove="${index}">Remover</button>
          </article>`;
      }

      const hasPrice = product.price !== null && product.price !== undefined && Number.isFinite(Number(product.price));
      if (hasPrice) total += Number(product.price) * item.quantity;
      else totalKnown = false;

      return `
        <article class="cart-item">
          <div class="cart-item-info">
            <strong>${escapeHtml(product.title)} — ${escapeHtml(product.color)}</strong>
            <span>Tamanho ${escapeHtml(item.size || "a combinar")}${hasPrice ? ` · ${formatPrice(Number(product.price) * item.quantity)}` : ""}</span>
          </div>
          <div class="cart-item-controls">
            <button class="cart-quantity-button" type="button" data-cart-change="${index}" data-change="-1" aria-label="Diminuir quantidade" ${item.quantity <= 1 ? "disabled" : ""}>−</button>
            <span class="cart-quantity">${item.quantity}</span>
            <button class="cart-quantity-button" type="button" data-cart-change="${index}" data-change="1" aria-label="Aumentar quantidade" ${item.quantity >= 99 ? "disabled" : ""}>+</button>
            <button class="cart-remove" type="button" data-cart-remove="${index}">Remover</button>
          </div>
        </article>`;
    }).join("")
    : '<p class="cart-empty">Seu carrinho está vazio. Escolha uma peça para começar.</p>';

  cartTotal.textContent = totalKnown ? `Total: ${formatPrice(total)}` : "";
  cartHint.textContent = canCheckout
    ? (totalKnown ? "Disponibilidade e valor serão confirmados pela loja." : "Valores e disponibilidade serão confirmados pela loja no WhatsApp.")
    : cart.length ? "Remova os itens indisponíveis para continuar." : "";
  cartCheckout.disabled = !canCheckout;
}

function addToCart(product, size) {
  if (!product || product.active === false) {
    showToast("Esta peça está indisponível no momento.", true);
    return;
  }
  const existingItem = cart.find((item) => item.productId === product.id && item.size === size);
  if (existingItem) {
    if (existingItem.quantity >= 99) {
      showToast("O limite por peça no carrinho é 99 unidades.", true);
      return;
    }
    existingItem.quantity += 1;
  } else {
    cart.push({ productId: product.id, size, quantity: 1 });
  }
  saveCart();
  renderCart();
  productDialog.close();
  cartDialog.showModal();
}

function buildCartOrderMessage() {
  const lines = cart.map((item, index) => {
    const product = products.find((entry) => entry.id === item.productId);
    const price = product.price !== null && product.price !== undefined && Number.isFinite(Number(product.price))
      ? ` — ${formatPrice(Number(product.price) * item.quantity)}`
      : "";
    return `${index + 1}. ${item.quantity}x ${product.title} — ${product.color} | Tamanho: ${item.size || "a combinar"}${price}`;
  });
  const totalKnown = cart.every((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return product && product.price !== null && product.price !== undefined && Number.isFinite(Number(product.price));
  });
  const total = totalKnown
    ? `\n\nTotal anunciado: ${formatPrice(cart.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId);
      return sum + Number(product.price) * item.quantity;
    }, 0))}`
    : "";
  return `Oi! Quero fazer um pedido da Thunder Sthormy:\n\n${lines.join("\n")}${total}\n\nPode confirmar a disponibilidade?`;
}

function showViewerImage(index) {
  if (!viewerImages.length) return;
  viewerImageIndex = (index + viewerImages.length) % viewerImages.length;
  viewerImage.src = viewerImages[viewerImageIndex];
  viewerCount.textContent = `${viewerImageIndex + 1} / ${viewerImages.length}`;
  imageViewerDialog.querySelector("#viewer-previous").hidden = viewerImages.length < 2;
  imageViewerDialog.querySelector("#viewer-next").hidden = viewerImages.length < 2;
}

function openImageViewer(images, index) {
  viewerImages = images;
  showViewerImage(index);
  imageViewerDialog.showModal();
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", isDark ? "Ativar modo claro" : "Ativar modo escuro");
}

let savedTheme = null;
try {
  savedTheme = localStorage.getItem("thunder-catalog-theme");
} catch (error) {
  console.warn("Não foi possível recuperar a preferência de tema salva.", error);
}
applyTheme(savedTheme === "light" ? "light" : "dark");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(`Não foi possível conectar à API (${url}). Verifique a conexão e tente novamente.`);
  }
  if (url === "/api/products") {
    offlineCatalog = response.headers.get("X-Offline-Cache") === "true" || !navigator.onLine;
  }
  const responseText = await response.text();
  let result = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = {};
  }
  if (!response.ok) {
    throw new Error(result.error || `A API respondeu com erro HTTP ${response.status} em ${url}. Consulte o Runtime Log da Vercel.`);
  }
  return result;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

function getWhatsAppUrl(message) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

function formatPrice(price) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
}

function getCatalogImageUrl(image) {
  const assetPrefix = "/assets/products/";
  if (typeof image !== "string" || !image.startsWith(assetPrefix)) return image;
  const fileName = image.slice(assetPrefix.length);
  if (!fileName.endsWith(".webp") || fileName.includes("/")) return image;
  return `${assetPrefix}thumbs/${fileName}`;
}

function getVisibleProducts() {
  const query = normalized(searchInput.value.trim());
  return products.filter((product) => {
    const categoryMatches = selectedCategory === "TODAS" || product.category === selectedCategory;
    const searchableText = normalized([
      product.title,
      product.color,
      product.description,
      categoryLabels[product.category],
      ...(product.sizes || []),
    ].join(" "));
    return categoryMatches && (!query || searchableText.includes(query));
  });
}

function renderCounts() {
  document.querySelectorAll("[data-count]").forEach((counter) => {
    const category = counter.dataset.count;
    const count = category === "TODAS"
      ? products.length
      : products.filter((product) => product.category === category).length;
    counter.textContent = count ? `(${count})` : "";
  });
}

function activateProductCard(card) {
  productGrid.querySelectorAll(".product-card.is-gallery-active").forEach((activeCard) => {
    activeCard.classList.remove("is-gallery-active");
  });
  card.classList.add("is-gallery-active");
}

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  renderCounts();
  catalogStatus.textContent = products.length
    ? `${visibleProducts.length} ${visibleProducts.length === 1 ? "peça encontrada" : "peças encontradas"}`
    : "Nenhuma peça cadastrada ainda.";
  if (offlineCatalog) catalogStatus.textContent += " · Catálogo salvo para acesso offline";
  emptyState.hidden = visibleProducts.length > 0;
  productGrid.innerHTML = visibleProducts.map((product, index) => {
    const sizes = (product.sizes || []).map(escapeHtml).join(" · ") || "Consulte os tamanhos";
    const images = Array.isArray(product.images) ? product.images : [];
    const firstImage = escapeHtml(product.images?.[0] || "");
    const imageCount = images.length;
    const unavailable = product.active === false
      ? '<div class="product-unavailable">Indisponível</div>'
      : "";
    const price = product.price ? formatPrice(product.price) : "Consulte o valor";
    return `
      <article class="product-card" data-product-id="${escapeHtml(product.id)}">
        <div class="product-photo-wrap">
          <button class="product-photo-button" type="button" data-product="${escapeHtml(product.id)}" aria-label="Ver detalhes de ${escapeHtml(product.title)}">
            <img class="product-photo" data-card-image-index="0" src="${escapeHtml(getCatalogImageUrl(firstImage))}" alt="${escapeHtml(product.title)} — ${escapeHtml(product.color)}" loading="${index < 3 ? "eager" : "lazy"}" decoding="async" fetchpriority="${index === 0 ? "high" : "auto"}">
            <span class="product-label">${escapeHtml(categoryLabels[product.category] || product.category)}</span>
          </button>
          ${imageCount > 1 ? `
            <button class="product-gallery-arrow product-gallery-previous" type="button" data-card-gallery-step="-1" aria-label="Foto anterior de ${escapeHtml(product.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button>
            <button class="product-gallery-arrow product-gallery-next" type="button" data-card-gallery-step="1" aria-label="Próxima foto de ${escapeHtml(product.title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button>
            <span class="product-image-count" data-card-image-count>1 / ${imageCount}</span>` : ""}
          ${unavailable}
        </div>
        <div class="product-info">
          <div class="product-overline"><span>${escapeHtml(product.color)}</span><span>${price}</span></div>
          <h3 class="product-title">${escapeHtml(product.title)}</h3>
          <p class="product-description">${escapeHtml(product.description)}</p>
          <div class="product-meta">
            <span class="size-list">Tamanhos: ${sizes}</span>
            <button class="product-order" type="button" data-product="${escapeHtml(product.id)}">Ver peça <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function buildOrderMessage(product, size) {
  const price = product.price !== null && product.price !== undefined ? `\nValor anunciado: ${formatPrice(product.price)}` : "";
  return `Oi! Tenho interesse nesta peça da Thunder Sthormy:\n\n${product.title} — ${product.color}\nTamanho: ${size || "a combinar"}${price}\n\nPode me passar mais informações?`;
}

function openProduct(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product) return;
  const images = Array.isArray(product.images) ? product.images : [];
  const sizes = product.sizes || [];
  productDetail.innerHTML = `
    <div class="detail-layout">
      <div class="detail-gallery">
        <div class="detail-image-stage">
          <button class="detail-image-zoom" id="detail-image-zoom" type="button" aria-label="Ampliar foto de ${escapeHtml(product.title)}" ${images.length ? "" : "disabled"}>
            <img class="detail-main-image" id="detail-main-image" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(product.title)} — ${escapeHtml(product.color)}">
          </button>
          ${images.length > 1 ? `
            <button class="gallery-arrow gallery-previous" type="button" data-gallery-step="-1" aria-label="Foto anterior">‹</button>
            <button class="gallery-arrow gallery-next" type="button" data-gallery-step="1" aria-label="Próxima foto">›</button>
            <span class="detail-image-count" id="detail-image-count">1 / ${images.length}</span>` : ""}
        </div>
        ${images.length > 1 ? `<div class="detail-thumbnails">${images.map((image, index) => `
          <button class="detail-thumb ${index === 0 ? "is-active" : ""}" type="button" data-image-index="${index}" aria-label="Ver foto ${index + 1}">
            <img src="${escapeHtml(getCatalogImageUrl(image))}" alt="" loading="lazy" decoding="async">
          </button>`).join("")}</div>` : ""}
      </div>
      <div class="detail-copy">
        <p class="eyebrow eyebrow-dark"><span class="eyebrow-line"></span> ${escapeHtml(categoryLabels[product.category] || product.category)}</p>
        <h2 id="detail-title">${escapeHtml(product.title)}</h2>
        <p class="detail-color">${escapeHtml(product.color)}</p>
        <p class="detail-description">${escapeHtml(product.description)}</p>
        <p class="detail-price">${product.price !== null && product.price !== undefined ? formatPrice(product.price) : "Consulte o valor pelo WhatsApp"}</p>
        <span class="detail-label">Escolha seu tamanho</span>
        <div class="detail-sizes" role="group" aria-label="Tamanhos disponíveis">
          ${sizes.length ? sizes.map((size) => `<button class="size-button" type="button" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("") : '<span class="detail-hint">Consulte disponibilidade pelo WhatsApp.</span>'}
        </div>
        <div class="detail-actions">
          <button class="button button-outline" id="detail-add-cart" type="button" ${product.active === false || sizes.length ? "disabled" : ""}>Adicionar ao carrinho <span aria-hidden="true">+</span></button>
          <button class="button button-lime" id="detail-buy-now" type="button" ${product.active === false || sizes.length ? "disabled" : ""}>Comprar agora <span aria-hidden="true">↗</span></button>
        </div>
        <p class="detail-hint" id="detail-hint" aria-live="polite">${product.active === false ? "Esta peça está indisponível." : sizes.length ? "Escolha um tamanho para continuar." : "A confirmação de estoque acontece pelo WhatsApp."}</p>
      </div>
    </div>`;
  productDialog.showModal();
  const addButton = productDetail.querySelector("#detail-add-cart");
  const buyButton = productDetail.querySelector("#detail-buy-now");
  const hint = productDetail.querySelector("#detail-hint");
  let selectedSize = "";

  const selectImage = (index) => {
    if (!images.length) return;
    const selectedIndex = (index + images.length) % images.length;
    const mainImage = productDetail.querySelector("#detail-main-image");
    mainImage.src = images[selectedIndex];
    mainImage.alt = `${product.title} — ${product.color}, foto ${selectedIndex + 1}`;
    const imageCount = productDetail.querySelector("#detail-image-count");
    if (imageCount) imageCount.textContent = `${selectedIndex + 1} / ${images.length}`;
    productDetail.querySelectorAll(".detail-thumb").forEach((thumb) => {
      thumb.classList.toggle("is-active", Number(thumb.dataset.imageIndex) === selectedIndex);
    });
    productDetail.querySelector("#detail-image-zoom").setAttribute("aria-label", `Ampliar foto ${selectedIndex + 1} de ${product.title}`);
  };

  productDetail.querySelector("#detail-image-zoom").addEventListener("click", () => {
    if (images.length) {
      const activeThumb = productDetail.querySelector(".detail-thumb.is-active");
      openImageViewer(images, activeThumb ? Number(activeThumb.dataset.imageIndex) : 0);
    }
  });
  productDetail.querySelectorAll("[data-gallery-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const activeThumb = productDetail.querySelector(".detail-thumb.is-active");
      const currentIndex = activeThumb ? Number(activeThumb.dataset.imageIndex) : 0;
      selectImage(currentIndex + Number(button.dataset.galleryStep));
    });
  });
  productDetail.querySelectorAll(".detail-thumb").forEach((button) => {
    button.addEventListener("click", () => selectImage(Number(button.dataset.imageIndex)));
  });

  productDetail.querySelectorAll(".size-button").forEach((button) => {
    button.addEventListener("click", () => {
      productDetail.querySelectorAll(".size-button").forEach((sizeButton) => sizeButton.classList.remove("is-selected"));
      button.classList.add("is-selected");
      selectedSize = button.dataset.size;
      addButton.disabled = product.active === false;
      buyButton.disabled = product.active === false;
      hint.textContent = "Você confirma a disponibilidade ao conversar com a loja.";
    });
  });

  addButton.addEventListener("click", () => addToCart(product, selectedSize));
  buyButton.addEventListener("click", () => {
    if (product.active !== false) {
      window.open(getWhatsAppUrl(buildOrderMessage(product, selectedSize)), "_blank", "noopener,noreferrer");
    }
  });
}

function openLogin() {
  adminContent.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-login">
        <p class="eyebrow eyebrow-dark"><span class="eyebrow-line"></span> Thunder Sthormy</p>
        <h2 id="admin-title">Área da loja</h2>
        <p>Entre para cadastrar peças, editar descrições, tamanhos, cores e fotos.</p>
        <form class="admin-form" id="login-form">
          <div class="form-field">
            <label for="admin-password">Senha de acesso</label>
            <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <p class="admin-error" id="login-error" aria-live="polite"></p>
          <button class="button button-dark" type="submit">Entrar <span aria-hidden="true">↗</span></button>
        </form>
      </div>
    </div>`;
  const form = adminContent.querySelector("#login-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = adminContent.querySelector("#login-error");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    error.textContent = "";
    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ password: new FormData(form).get("password") }),
      });
      await loadProducts();
      await openDashboard();
      showToast("Acesso autorizado.");
    } catch (loginError) {
      error.textContent = loginError.message;
      button.disabled = false;
    }
  });
}

async function openDashboard() {
  adminProducts = await api("/api/products");
  renderDashboard();
}

function renderDashboard(editProduct = null) {
  editingId = editProduct?.id || null;
  const productToEdit = editProduct || null;
  const imagePaths = productToEdit?.images || [];
  adminContent.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-top">
        <div>
          <p class="eyebrow eyebrow-dark"><span class="eyebrow-line"></span> Thunder Sthormy</p>
          <h2 id="admin-title">Gestão da coleção</h2>
          <p class="admin-subtitle">Cadastre uma peça ou atualize os detalhes da coleção.</p>
        </div>
        <button class="text-button" type="button" id="admin-logout">Sair da conta</button>
      </div>
      ${imageUploadsEnabled ? "" : '<p class="login-unavailable" role="status">Edição e exclusão estão disponíveis. Para enviar fotos novas, configure o armazenamento Vercel Blob.</p>'}
      <form class="admin-form" id="product-form">
        <div class="admin-products-head">
          <h3>${productToEdit ? "Editar peça" : "Nova peça"}</h3>
          ${productToEdit ? '<button class="text-button" type="button" id="cancel-edit">Cancelar edição</button>' : ""}
        </div>
        <div class="form-grid">
          <div class="form-field">
            <label for="product-title">Nome da peça</label>
            <input id="product-title" name="title" maxlength="80" required value="${escapeHtml(productToEdit?.title || "")}" placeholder="Ex.: Camiseta Essential">
          </div>
          <div class="form-field">
            <label for="product-category">Categoria</label>
            <select id="product-category" name="category" required>
              ${Object.entries(categoryLabels).map(([value, label]) => `<option value="${value}" ${productToEdit?.category === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="product-color">Cor</label>
            <input id="product-color" name="color" maxlength="50" required value="${escapeHtml(productToEdit?.color || "")}" placeholder="Ex.: Preto">
          </div>
          <div class="form-field">
            <label for="product-sizes">Tamanhos disponíveis</label>
            <input id="product-sizes" name="sizes" maxlength="120" value="${escapeHtml((productToEdit?.sizes || []).join(", "))}" placeholder="P, M, G, GG">
          </div>
          <div class="form-field full">
            <label for="product-description">Descrição</label>
            <textarea id="product-description" name="description" maxlength="1000" required placeholder="Descreva os detalhes da peça.">${escapeHtml(productToEdit?.description || "")}</textarea>
          </div>
          <div class="form-field">
            <label for="product-price">Preço (opcional)</label>
            <input id="product-price" name="price" type="number" min="0.01" max="10000000" step="0.01" value="${productToEdit?.price ? escapeHtml(productToEdit.price) : ""}" placeholder="Deixe vazio para consultar">
          </div>
          <div class="form-field">
            <label for="product-photos">Fotos (até 6)</label>
            <input id="product-photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>
            <p class="form-help">JPG, PNG ou WEBP. Cada imagem será otimizada antes do envio.</p>
          </div>
          <div class="form-field full">
            <span class="form-label">Fotos atuais / selecionadas</span>
            <div class="photo-preview" id="photo-preview"></div>
            ${productToEdit ? `<label class="check-row"><input type="checkbox" name="replace-images"> Substituir as fotos atuais pelas novas fotos selecionadas</label>` : ""}
          </div>
          <div class="form-field full">
            <label class="check-row"><input type="checkbox" name="active" ${productToEdit?.active === false ? "" : "checked"}> Peça disponível no catálogo</label>
          </div>
        </div>
        <p class="admin-error" id="product-error" aria-live="polite"></p>
        <p class="form-help" id="product-status" role="status" aria-live="polite" hidden></p>
        <div class="form-actions">
          <button class="button button-dark button-small" type="submit">${productToEdit ? "Salvar alterações" : "Cadastrar peça"} <span aria-hidden="true">↗</span></button>
          ${productToEdit ? '<button class="text-button" type="button" id="cancel-edit-secondary">Cancelar</button>' : ""}
        </div>
      </form>
      <hr class="admin-divider">
      <div class="admin-products-head"><h3>Peças cadastradas</h3><span class="form-help">${adminProducts.length} no total</span></div>
      <div class="admin-product-list">
        ${adminProducts.length ? adminProducts.map((product) => `
          <div class="admin-product-row">
            <img src="${escapeHtml(product.images?.[0] || "")}" alt="">
            <div class="admin-product-name">
              <strong>${escapeHtml(product.title)}</strong>
              <span>${escapeHtml(categoryLabels[product.category] || product.category)} · ${escapeHtml(product.color)} · <span class="status-pill ${product.active === false ? "is-hidden" : ""}">${product.active === false ? "Oculta" : "No catálogo"}</span></span>
            </div>
            <div class="admin-product-actions">
              <button class="text-button" type="button" data-edit="${escapeHtml(product.id)}">Editar</button>
              <button class="text-button" type="button" data-delete="${escapeHtml(product.id)}">Excluir</button>
            </div>
          </div>`).join("") : '<p class="admin-empty">Nenhuma peça cadastrada.</p>'}
      </div>
    </div>`;
  renderPhotoPreview(imagePaths);

  adminContent.querySelector("#product-photos").addEventListener("change", (event) => {
    const files = [...event.target.files];
    renderPhotoPreview(imagePaths, files);
  });

  adminContent.querySelector("#product-form").addEventListener("submit", saveProduct);
  adminContent.querySelector("#admin-logout").addEventListener("click", logout);
  adminContent.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = adminProducts.find((entry) => entry.id === button.dataset.edit);
      if (product) renderDashboard(product);
    });
  });
  adminContent.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.delete));
  });
  adminContent.querySelector("#cancel-edit")?.addEventListener("click", () => renderDashboard());
  adminContent.querySelector("#cancel-edit-secondary")?.addEventListener("click", () => renderDashboard());
}

function renderPhotoPreview(existingImages = [], selectedFiles = []) {
  const preview = adminContent.querySelector("#photo-preview");
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewObjectUrls = selectedFiles.map((file) => URL.createObjectURL(file));
  const persisted = existingImages.map((image) => `
    <div class="photo-preview-item"><img src="${escapeHtml(image)}" alt=""><span>Atual</span></div>`).join("");
  const pending = selectedFiles.map((file, index) => `
    <div class="photo-preview-item"><img src="${previewObjectUrls[index]}" alt=""><span>${escapeHtml(file.name)}</span></div>`).join("");
  preview.innerHTML = persisted + pending || '<span class="form-help">Nenhuma foto selecionada.</span>';
}

async function optimizeImage(file) {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
    throw new Error(`${file.name}: escolha uma imagem de até 15 MB.`);
  }
  const image = await createImageBitmap(file);
  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const optimized = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .72));
  if (!optimized) throw new Error(`Não foi possível otimizar ${file.name}.`);
  if (optimized.size > 2 * 1024 * 1024) {
    throw new Error(`${file.name}: a foto otimizada excede 2 MB. Escolha uma imagem menor.`);
  }
  return optimized;
}

async function saveProduct(event) {
  event.preventDefault();
  const wasEditing = Boolean(editingId);
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const error = adminContent.querySelector("#product-error");
  const status = adminContent.querySelector("#product-status");
  const submitLabel = submitButton.textContent.trim();
  const formData = new FormData(form);
  const selectedFiles = [...form.querySelector("#product-photos").files];
  const replaceImages = Boolean(formData.get("replace-images"));
  const currentProduct = editingId ? adminProducts.find((entry) => entry.id === editingId) : null;
  let imagePaths = replaceImages ? [] : [...(currentProduct?.images || [])];
  error.textContent = "";

  if (imagePaths.length + selectedFiles.length > 6) {
    error.textContent = "O limite é de 6 fotos por peça. Marque para substituir as fotos atuais ou selecione menos imagens.";
    return;
  }
  if (!imagePaths.length && !selectedFiles.length) {
    error.textContent = "Adicione pelo menos uma foto para a peça.";
    return;
  }

  submitButton.disabled = true;
  try {
    for (const [index, file] of selectedFiles.entries()) {
      status.hidden = false;
      status.textContent = `Preparando foto ${index + 1} de ${selectedFiles.length}...`;
      const image = await optimizeImage(file);
      status.textContent = `Enviando foto ${index + 1} de ${selectedFiles.length}...`;
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": image.type },
        body: image,
      });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(uploaded.error || "Não foi possível enviar a foto.");
      imagePaths.push(uploaded.path);
    }
    status.hidden = false;
    status.textContent = "Salvando os dados da peça...";
    const product = {
      title: formData.get("title"),
      category: formData.get("category"),
      color: formData.get("color"),
      description: formData.get("description"),
      sizes: String(formData.get("sizes") || "").split(/[,;]+/).map((size) => size.trim()).filter(Boolean),
      price: formData.get("price") || null,
      active: Boolean(formData.get("active")),
      images: imagePaths,
    };
    await api(editingId ? `/api/products/${editingId}` : "/api/products", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(product),
    });
    status.textContent = "Atualizando o catálogo...";
    await loadProducts();
    await openDashboard();
    showToast(wasEditing ? "Peça atualizada com sucesso." : "Peça cadastrada com sucesso.");
  } catch (errorValue) {
    error.textContent = errorValue.message;
    status.hidden = true;
    submitButton.textContent = submitLabel;
    submitButton.disabled = false;
  }
}

async function deleteProduct(productId) {
  const product = adminProducts.find((entry) => entry.id === productId);
  if (!product || !window.confirm(`Excluir "${product.title}" do catálogo?`)) return;
  try {
    await api(`/api/products/${productId}`, { method: "DELETE" });
    await loadProducts();
    await openDashboard();
    showToast("Peça excluída.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    openLogin();
    showToast("Você saiu da área da loja.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadProducts() {
  products = await api("/api/products");
  renderProducts();
  renderCart();
}

async function openAdmin() {
  adminDialog.showModal();
  adminContent.innerHTML = '<div class="admin-wrap"><p class="admin-subtitle">Carregando área da loja...</p></div>';
  try {
    const session = await api("/api/session");
    imageUploadsEnabled = session.imageUploadsEnabled;
    if (!session.adminEnabled) {
      adminContent.innerHTML = `
        <div class="admin-wrap">
          <div class="admin-login">
            <p class="eyebrow eyebrow-dark"><span class="eyebrow-line"></span> Thunder Sthormy</p>
            <h2 id="admin-title">Área da loja</h2>
            <p>Complete a configuração do servidor para habilitar o cadastro e a edição de produtos.</p>
            <div class="login-unavailable">Configuração pendente: <strong>${escapeHtml(session.missing.join(", "))}</strong>. Consulte as instruções de hospedagem.</div>
          </div>
        </div>`;
      return;
    }
    if (session.authenticated) await openDashboard();
    else openLogin();
  } catch (error) {
    adminContent.innerHTML = `<div class="admin-wrap"><p class="admin-error">${escapeHtml(error.message)}</p></div>`;
  }
}

document.querySelectorAll("[data-category]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedCategory = button.dataset.category;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("is-selected", chip === button));
    renderProducts();
  });
});

searchInput.addEventListener("input", renderProducts);
productGrid.addEventListener("click", (event) => {
  const galleryButton = event.target.closest("[data-card-gallery-step]");
  if (galleryButton) {
    const card = galleryButton.closest(".product-card");
    activateProductCard(card);
    const product = products.find((entry) => entry.id === card.dataset.productId);
    const photo = card.querySelector(".product-photo");
    if (product && product.images?.length > 1) {
      const currentIndex = Number(photo.dataset.cardImageIndex || 0);
      const nextIndex = (currentIndex + Number(galleryButton.dataset.cardGalleryStep) + product.images.length) % product.images.length;
      photo.dataset.cardImageIndex = String(nextIndex);
      photo.src = getCatalogImageUrl(product.images[nextIndex]);
      photo.alt = `${product.title} — ${product.color}, foto ${nextIndex + 1}`;
      card.querySelector("[data-card-image-count]").textContent = `${nextIndex + 1} / ${product.images.length}`;
    }
    return;
  }
  const button = event.target.closest("[data-product]");
  if (button) openProduct(button.dataset.product);
});
productGrid.addEventListener("pointerover", (event) => {
  const card = event.target.closest(".product-card");
  if (card && !card.contains(event.relatedTarget)) activateProductCard(card);
});
productGrid.addEventListener("focusin", (event) => {
  const card = event.target.closest(".product-card");
  if (card) activateProductCard(card);
});
cartToggle.addEventListener("click", () => {
  renderCart();
  cartDialog.showModal();
});
cartItemsContainer.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-cart-remove]");
  if (removeButton) {
    cart.splice(Number(removeButton.dataset.cartRemove), 1);
    saveCart();
    renderCart();
    return;
  }
  const quantityButton = event.target.closest("[data-cart-change]");
  if (!quantityButton) return;
  const item = cart[Number(quantityButton.dataset.cartChange)];
  if (!item) return;
  item.quantity = Math.max(1, Math.min(99, item.quantity + Number(quantityButton.dataset.change)));
  saveCart();
  renderCart();
});
cartCheckout.addEventListener("click", () => {
  const allItemsAvailable = cart.length > 0 && cart.every((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    return product && product.active !== false;
  });
  if (allItemsAvailable) window.open(getWhatsAppUrl(buildCartOrderMessage()), "_blank", "noopener,noreferrer");
});
document.querySelector("#viewer-previous").addEventListener("click", () => showViewerImage(viewerImageIndex - 1));
document.querySelector("#viewer-next").addEventListener("click", () => showViewerImage(viewerImageIndex + 1));
imageViewerDialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" && viewerImages.length > 1) {
    event.preventDefault();
    showViewerImage(viewerImageIndex - 1);
  } else if (event.key === "ArrowRight" && viewerImages.length > 1) {
    event.preventDefault();
    showViewerImage(viewerImageIndex + 1);
  }
});
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try {
    localStorage.setItem("thunder-catalog-theme", nextTheme);
  } catch (error) {
    console.warn("Não foi possível salvar a preferência de tema.", error);
  }
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installToggle.hidden = false;
});
installToggle.addEventListener("click", async () => {
  if (!installPrompt) {
    showToast("Para instalar, toque em Compartilhar e escolha Adicionar à Tela de Início.");
    return;
  }
  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") installToggle.hidden = true;
  } catch (error) {
    console.error("Não foi possível iniciar a instalação do catálogo.", error);
    showToast("Não foi possível iniciar a instalação agora.", true);
  } finally {
    installPrompt = null;
  }
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installToggle.hidden = true;
});
const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches
  || navigator.standalone === true;
if (isIosDevice && !isStandalone) installToggle.hidden = false;
function waitForServiceWorkerControl() {
 if (navigator.serviceWorker.controller) return Promise.resolve();
 return new Promise((resolve) => {
   const timeout = window.setTimeout(() => {
     navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
     resolve();
   }, 3000);
   function onControllerChange() {
     window.clearTimeout(timeout);
     resolve();
   }
   navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
   if (navigator.serviceWorker.controller) onControllerChange();
 });
}
function waitForServiceWorkerActivation() {
 return new Promise((resolve) => {
   const timeout = window.setTimeout(() => resolve(null), 3000);
   navigator.serviceWorker.ready.then((registration) => {
     window.clearTimeout(timeout);
     resolve(registration);
   });
 });
}
const serviceWorkerReady = "serviceWorker" in navigator && window.isSecureContext
 ? navigator.serviceWorker.register("/sw.js")
   .then(waitForServiceWorkerActivation)
   .then((registration) => registration ? waitForServiceWorkerControl() : undefined)
   .catch((error) => {
     console.error("Não foi possível ativar o modo offline do catálogo.", error);
   })
 : Promise.resolve();
document.querySelector("#current-year").textContent = String(new Date().getFullYear());
renderCart();

serviceWorkerReady.then(() => Promise.all([api("/api/config"), loadProducts()]))
 .then(([config]) => {
   whatsappNumber = config.whatsappNumber;
 })
 .catch((error) => {
   catalogStatus.textContent = error.message;
   catalogStatus.classList.add("admin-error");
   showToast("Não foi possível carregar o catálogo. Tente novamente.", true);
 });
