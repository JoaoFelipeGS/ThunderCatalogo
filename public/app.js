const productGrid = document.querySelector("#product-grid");
const emptyState = document.querySelector("#empty-state");
const catalogStatus = document.querySelector("#catalog-status");
const searchInput = document.querySelector("#product-search");
const productDialog = document.querySelector("#product-dialog");
const productDetail = document.querySelector("#product-detail");
const adminDialog = document.querySelector("#admin-dialog");
const adminContent = document.querySelector("#admin-content");
const toast = document.querySelector("#toast");

let products = [];
let selectedCategory = "TODAS";
let whatsappNumber = "";
let toastTimer;
let editingId = null;
let adminProducts = [];
let previewObjectUrls = [];
let imageUploadsEnabled = true;

const categoryLabels = {
  BERMUDA: "Bermuda",
  OVERSIZED: "Oversized",
  PERUANA: "Peruana",
};

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
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a solicitação.");
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

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  renderCounts();
  catalogStatus.textContent = products.length
    ? `${visibleProducts.length} ${visibleProducts.length === 1 ? "peça encontrada" : "peças encontradas"}`
    : "Nenhuma peça cadastrada ainda.";
  emptyState.hidden = visibleProducts.length > 0;
  productGrid.innerHTML = visibleProducts.map((product, index) => {
    const sizes = (product.sizes || []).map(escapeHtml).join(" · ") || "Consulte os tamanhos";
    const firstImage = escapeHtml(product.images?.[0] || "");
    const unavailable = product.active === false
      ? '<div class="product-unavailable">Indisponível</div>'
      : "";
    const price = product.price ? formatPrice(product.price) : "Consulte o valor";
    return `
      <article class="product-card">
        <button class="product-photo-wrap product-photo-button" type="button" data-product="${escapeHtml(product.id)}" aria-label="Ver detalhes de ${escapeHtml(product.title)}">
          <img class="product-photo" src="${escapeHtml(getCatalogImageUrl(firstImage))}" alt="${escapeHtml(product.title)} — ${escapeHtml(product.color)}" loading="${index < 3 ? "eager" : "lazy"}" decoding="async" fetchpriority="${index === 0 ? "high" : "auto"}">
          <span class="product-label">${escapeHtml(categoryLabels[product.category] || product.category)}</span>
          ${unavailable}
        </button>
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
  const price = product.price ? `\nValor anunciado: ${formatPrice(product.price)}` : "";
  return `Oi! Tenho interesse nesta peça da Thunder Sthormy:\n\n${product.title} — ${product.color}\nTamanho: ${size || "a combinar"}${price}\n\nPode me passar mais informações?`;
}

function openProduct(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product) return;
  const images = product.images || [];
  const sizes = product.sizes || [];
  productDetail.innerHTML = `
    <div class="detail-layout">
      <div class="detail-gallery">
        <img class="detail-main-image" id="detail-main-image" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(product.title)} — ${escapeHtml(product.color)}">
        ${images.length > 1 ? `<div class="detail-thumbnails">${images.map((image, index) => `
          <button class="detail-thumb ${index === 0 ? "is-active" : ""}" type="button" data-image="${escapeHtml(image)}" aria-label="Ver foto ${index + 1}">
            <img src="${escapeHtml(getCatalogImageUrl(image))}" alt="" loading="lazy" decoding="async">
          </button>`).join("")}</div>` : ""}
      </div>
      <div class="detail-copy">
        <p class="eyebrow eyebrow-dark"><span class="eyebrow-line"></span> ${escapeHtml(categoryLabels[product.category] || product.category)}</p>
        <h2 id="detail-title">${escapeHtml(product.title)}</h2>
        <p class="detail-color">${escapeHtml(product.color)}</p>
        <p class="detail-description">${escapeHtml(product.description)}</p>
        <p class="detail-price">${product.price ? formatPrice(product.price) : "Consulte o valor pelo WhatsApp"}</p>
        <span class="detail-label">Escolha seu tamanho</span>
        <div class="detail-sizes" role="group" aria-label="Tamanhos disponíveis">
          ${sizes.length ? sizes.map((size) => `<button class="size-button" type="button" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("") : '<span class="detail-hint">Consulte disponibilidade pelo WhatsApp.</span>'}
        </div>
        <button class="button button-lime detail-order" id="detail-order" type="button" disabled>Escolha um tamanho <span aria-hidden="true">↗</span></button>
        <p class="detail-hint" id="detail-hint" aria-live="polite">A confirmação de estoque acontece pelo WhatsApp.</p>
      </div>
    </div>`;
  productDialog.showModal();
  const orderButton = productDetail.querySelector("#detail-order");
  const hint = productDetail.querySelector("#detail-hint");
  productDetail.querySelectorAll(".size-button").forEach((button) => {
    button.addEventListener("click", () => {
      productDetail.querySelectorAll(".size-button").forEach((sizeButton) => sizeButton.classList.remove("is-selected"));
      button.classList.add("is-selected");
      orderButton.disabled = false;
      orderButton.innerHTML = 'Pedir pelo WhatsApp <span aria-hidden="true">↗</span>';
      orderButton.onclick = () => window.open(getWhatsAppUrl(buildOrderMessage(product, button.dataset.size)), "_blank", "noopener,noreferrer");
      hint.textContent = "Você confirma a disponibilidade ao conversar com a loja.";
    });
  });
  if (!sizes.length) {
    orderButton.disabled = false;
    orderButton.innerHTML = 'Consultar pelo WhatsApp <span aria-hidden="true">↗</span>';
    orderButton.onclick = () => window.open(getWhatsAppUrl(buildOrderMessage(product, "")), "_blank", "noopener,noreferrer");
  }
  productDetail.querySelectorAll(".detail-thumb").forEach((button) => {
    button.addEventListener("click", () => {
      productDetail.querySelector("#detail-main-image").src = button.dataset.image;
      productDetail.querySelectorAll(".detail-thumb").forEach((thumb) => thumb.classList.remove("is-active"));
      button.classList.add("is-active");
    });
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

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler uma das imagens."));
    reader.readAsDataURL(blob);
  });
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
  const dataUrl = await readAsDataUrl(optimized);
  return { mimeType: optimized.type, data: dataUrl.split(",")[1] };
}

async function saveProduct(event) {
  event.preventDefault();
  const wasEditing = Boolean(editingId);
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const error = adminContent.querySelector("#product-error");
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
    for (const file of selectedFiles) {
      const image = await optimizeImage(file);
      const uploaded = await api("/api/images", {
        method: "POST",
        body: JSON.stringify(image),
      });
      imagePaths.push(uploaded.path);
    }
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
    await loadProducts();
    await openDashboard();
    showToast(wasEditing ? "Peça atualizada com sucesso." : "Peça cadastrada com sucesso.");
  } catch (errorValue) {
    error.textContent = errorValue.message;
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
  const button = event.target.closest("[data-product]");
  if (button) openProduct(button.dataset.product);
});
document.querySelector("#admin-open").addEventListener("click", openAdmin);
document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.querySelector("#current-year").textContent = String(new Date().getFullYear());

Promise.all([api("/api/config"), loadProducts()])
  .then(([config]) => {
    whatsappNumber = config.whatsappNumber;
  })
  .catch((error) => {
    catalogStatus.textContent = error.message;
    catalogStatus.classList.add("admin-error");
    showToast("Não foi possível carregar o catálogo. Tente novamente.", true);
  });
