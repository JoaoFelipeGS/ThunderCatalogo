const adminPage = document.querySelector("#admin-page");
const productDialog = document.querySelector("#product-dialog");
const toast = document.querySelector("#toast");

const categoryLabels = {
  BERMUDA: "Bermuda",
  OVERSIZED: "Oversized",
  PERUANA: "Peruana",
};

let products = [];
let imageUploadsEnabled = false;
let editingId = null;
let editingImages = [];
let previewUrls = [];
let toastTimer;

productDialog.addEventListener("close", () => {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
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
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {};
  }
  if (!response.ok) {
    throw new Error(result.error || `A API respondeu com erro HTTP ${response.status} em ${url}.`);
  }
  return result;
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

function renderConfiguration(message) {
  adminPage.innerHTML = `
    <section class="login-screen">
      <div class="login-brand-panel">
        <img class="login-brand" src="/assets/logo-thunder.jpg?v=2" alt="Thunder Sthormy">
        <h1>Estoque.<span>Sem complicação.</span></h1>
        <span class="login-brand-footer">Thunder Sthormy · Painel da loja</span>
      </div>
      <div class="login-panel">
        <div class="login-box">
          <p class="eyebrow">Painel da loja</p>
          <h2>Configuração pendente</h2>
          <p>O acesso administrativo ainda não está configurado neste ambiente.</p>
          <div class="configuration-message">${escapeHtml(message)}</div>
          <p><a class="topbar-link" href="/">Voltar ao catálogo</a></p>
        </div>
      </div>
    </section>`;
}

function renderLogin(errorMessage = "") {
  adminPage.innerHTML = `
    <section class="login-screen">
      <div class="login-brand-panel">
        <img class="login-brand" src="/assets/logo-thunder.jpg?v=2" alt="Thunder Sthormy">
        <h1>Estoque.<span>Sem complicação.</span></h1>
        <span class="login-brand-footer">Thunder Sthormy · Painel da loja</span>
      </div>
      <div class="login-panel">
        <div class="login-box">
          <p class="eyebrow">Acesso restrito</p>
          <h2>Entrar na loja</h2>
          <p>Gerencie peças, disponibilidade e informações do catálogo.</p>
          <form id="login-form">
            <div class="field">
              <label for="admin-password">Senha de acesso</label>
              <input id="admin-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <p class="login-error" id="login-error" role="alert">${escapeHtml(errorMessage)}</p>
            <button class="button button-full" type="submit">Entrar <span aria-hidden="true">↗</span></button>
          </form>
          <p><a class="topbar-link" href="/">Voltar ao catálogo</a></p>
        </div>
      </div>
    </section>`;
  adminPage.querySelector("#login-form").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = adminPage.querySelector("#login-error");
  const button = form.querySelector('button[type="submit"]');
  error.textContent = "";
  button.disabled = true;
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password: new FormData(form).get("password") }),
    });
    await openDashboard();
  } catch (loginError) {
    error.textContent = loginError.message;
    button.disabled = false;
  }
}

async function loadProducts() {
  products = await api("/api/products");
}

async function openDashboard() {
  await loadProducts();
  renderDashboard();
}

function renderDashboard() {
  const inStock = products.filter((product) => product.active !== false).length;
  const outOfStock = products.length - inStock;
  adminPage.innerHTML = `
    <div class="admin-shell">
      <header class="topbar">
        <a class="topbar-brand" href="/" aria-label="Voltar ao catálogo">
          <img src="/assets/logo-thunder.jpg?v=2" alt="Thunder Sthormy">
          <span>Painel da loja</span>
        </a>
        <div class="topbar-actions">
          <a class="topbar-link" href="/">Ver catálogo ↗</a>
          <button class="logout-button" type="button" id="logout-button">Sair</button>
        </div>
      </header>
      <section class="dashboard">
        <div class="dashboard-heading">
          <div>
            <p class="eyebrow">Thunder Sthormy / Administração</p>
            <h1>Estoque</h1>
            <p>Gerencie as peças e a disponibilidade no catálogo.</p>
          </div>
          <button class="button" type="button" id="new-product">+ Nova peça</button>
        </div>
        ${imageUploadsEnabled ? "" : '<p class="notice">Você pode editar e excluir peças. Para cadastrar fotos novas, configure o Vercel Blob no ambiente Production.</p>'}
        <div class="stats" aria-label="Resumo do estoque">
          <article class="stat-card"><span>Peças cadastradas</span><strong>${products.length}</strong></article>
          <article class="stat-card"><span>Disponíveis</span><strong>${inStock}</strong></article>
          <article class="stat-card"><span>Indisponíveis</span><strong>${outOfStock}</strong></article>
        </div>
        <section class="inventory-panel" aria-labelledby="inventory-title">
          <div class="inventory-toolbar">
            <h2 id="inventory-title">Produtos</h2>
            <div class="inventory-controls">
              <label class="sr-only" for="inventory-search">Buscar produto</label>
              <input class="inventory-search" id="inventory-search" type="search" placeholder="Buscar peça..." autocomplete="off">
              <label class="sr-only" for="inventory-filter">Filtrar estoque</label>
              <select class="inventory-filter" id="inventory-filter">
                <option value="all">Todo estoque</option>
                <option value="available">Disponíveis</option>
                <option value="unavailable">Indisponíveis</option>
              </select>
            </div>
          </div>
          <div class="product-list" id="product-list"></div>
          <div class="inventory-footer" id="inventory-count"></div>
        </section>
      </section>
    </div>`;
  adminPage.querySelector("#new-product").addEventListener("click", () => openProductForm());
  adminPage.querySelector("#logout-button").addEventListener("click", logout);
  adminPage.querySelector("#inventory-search").addEventListener("input", renderProductRows);
  adminPage.querySelector("#inventory-filter").addEventListener("change", renderProductRows);
  renderProductRows();
}

function renderProductRows() {
  const list = adminPage.querySelector("#product-list");
  if (!list) return;
  const query = adminPage.querySelector("#inventory-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = adminPage.querySelector("#inventory-filter").value;
  const filtered = products.filter((product) => {
    const available = product.active !== false;
    const matchesAvailability = filter === "all" || (filter === "available" ? available : !available);
    const matchesQuery = [product.title, product.color, categoryLabels[product.category], ...(product.sizes || [])]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(query);
    return matchesAvailability && matchesQuery;
  });
  list.innerHTML = filtered.length ? filtered.map((product) => {
    const available = product.active !== false;
    const details = [
      categoryLabels[product.category] || product.category,
      product.color,
      product.sizes?.length ? `Tam. ${product.sizes.join(", ")}` : "",
      product.price ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.price) : "",
    ].filter(Boolean).map(escapeHtml).join(" · ");
    return `
      <article class="product-row">
        <img class="product-image" src="${escapeHtml(product.images?.[0] || "")}" alt="" loading="lazy">
        <div class="product-main">
          <strong>${escapeHtml(product.title)}</strong>
          <span>${details}</span>
        </div>
        <span class="stock-badge ${available ? "" : "is-out"}">${available ? "Disponível" : "Sem estoque"}</span>
        <div class="row-actions">
          <button class="row-action" type="button" data-edit="${escapeHtml(product.id)}">Editar</button>
          <button class="row-action" type="button" data-stock="${escapeHtml(product.id)}">${available ? "Indisponível" : "Disponível"}</button>
          <button class="row-action" type="button" data-delete="${escapeHtml(product.id)}">Excluir</button>
        </div>
      </article>`;
  }).join("") : '<div class="empty-inventory">Nenhuma peça encontrada.</div>';
  adminPage.querySelector("#inventory-count").textContent = `${filtered.length} de ${products.length} peças`;
  list.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openProductForm(products.find((product) => product.id === button.dataset.edit)));
  });
  list.querySelectorAll("[data-stock]").forEach((button) => {
    button.addEventListener("click", () => toggleStock(button.dataset.stock));
  });
  list.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.delete));
  });
}

function openProductForm(product = null) {
  editingId = product?.id || null;
  editingImages = [...(product?.images || [])];
  productDialog.innerHTML = `
    <div class="product-form-wrap">
      <div class="form-heading">
        <div class="form-heading-copy">
          <p class="eyebrow">Painel da loja <span>/</span> ${product ? "Editar produto" : "Novo produto"}</p>
          <h2 id="form-title">${product ? "Editar peça" : "Cadastrar peça"}</h2>
          <p>${product ? "Atualize os dados e as fotos deste anúncio." : "Preencha os detalhes da nova peça para o catálogo."}</p>
        </div>
        <button class="close-button" type="button" id="close-product-form" aria-label="Fechar">×</button>
      </div>
      <form id="product-form">
        <section class="form-section" aria-labelledby="product-details-heading">
          <div class="form-section-heading"><span>01</span><h3 id="product-details-heading">Informações da peça</h3></div>
          <div class="form-grid">
            <div class="field"><label for="product-title">Nome da peça</label><input id="product-title" name="title" maxlength="80" required value="${escapeHtml(product?.title || "")}" placeholder="Ex.: Camiseta Essential"></div>
            <div class="field"><label for="product-category">Categoria</label><select id="product-category" name="category" required>
              ${Object.entries(categoryLabels).map(([value, label]) => `<option value="${value}" ${product?.category === value ? "selected" : ""}>${label}</option>`).join("")}
            </select></div>
            <div class="field"><label for="product-color">Cor</label><input id="product-color" name="color" maxlength="50" required value="${escapeHtml(product?.color || "")}" placeholder="Ex.: Preto"></div>
            <div class="field"><label for="product-sizes">Tamanhos</label><input id="product-sizes" name="sizes" maxlength="120" value="${escapeHtml((product?.sizes || []).join(", "))}" placeholder="P, M, G, GG"></div>
            <div class="field full"><label for="product-description">Descrição</label><textarea id="product-description" name="description" maxlength="1000" required placeholder="Descreva os detalhes da peça.">${escapeHtml(product?.description || "")}</textarea></div>
            <div class="field"><label for="product-price">Preço (opcional)</label><input id="product-price" name="price" type="number" min="0.01" max="10000000" step="0.01" value="${product?.price ? escapeHtml(product.price) : ""}" placeholder="Deixe vazio para consultar"></div>
          </div>
        </section>
        <section class="form-section" aria-labelledby="product-photos-heading">
          <div class="form-section-heading"><span>02</span><h3 id="product-photos-heading">Fotos do anúncio</h3></div>
          <div class="field">
            <label for="product-photos">Adicionar fotos</label>
            <input id="product-photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple ${imageUploadsEnabled ? "" : "disabled"}>
            <span class="field-help">JPG, PNG ou WEBP. Até 6 fotos no total; cada foto nova será otimizada antes do envio.</span>
          </div>
          <div class="photo-gallery" id="photo-preview" aria-live="polite"></div>
        </section>
        <section class="form-section form-stock-section">
          <div class="form-section-heading"><span>03</span><h3>Disponibilidade</h3></div>
          <label class="check-field"><input type="checkbox" name="active" ${product?.active === false ? "" : "checked"}> Disponível no estoque e no catálogo</label>
        </section>
        <p class="form-error" id="product-error" role="alert"></p>
        <p class="form-status" id="product-status" role="status" aria-live="polite" hidden></p>
        <div class="form-actions"><button class="button" type="submit">${product ? "Salvar alterações" : "Cadastrar peça"} <span aria-hidden="true">↗</span></button><button class="button button-light" type="button" id="cancel-product-form">Cancelar</button></div>
      </form>
    </div>`;
  renderPhotoPreview();
  productDialog.showModal();
  productDialog.querySelector("#close-product-form").addEventListener("click", () => productDialog.close());
  productDialog.querySelector("#cancel-product-form").addEventListener("click", () => productDialog.close());
  productDialog.querySelector("#product-photos").addEventListener("change", (event) => {
    renderPhotoPreview([...event.target.files]);
  });
  productDialog.querySelector("#photo-preview").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-image]");
    if (!removeButton) return;
    editingImages.splice(Number(removeButton.dataset.removeImage), 1);
    renderPhotoPreview([...productDialog.querySelector("#product-photos").files]);
  });
  productDialog.querySelector("#product-form").addEventListener("submit", saveProduct);
}

function renderPhotoPreview(selectedFiles = []) {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = selectedFiles.map((file) => URL.createObjectURL(file));
  const persisted = editingImages.map((image, index) => `
    <figure class="photo-preview-item">
      <img src="${escapeHtml(image)}" alt="Foto ${index + 1} da peça">
      <figcaption>Foto ${index + 1}</figcaption>
      <button class="remove-photo" type="button" data-remove-image="${index}" aria-label="Remover foto ${index + 1}" title="Remover foto">×</button>
    </figure>`).join("");
  const pending = selectedFiles.map((file, index) => `
    <figure class="photo-preview-item is-new">
      <img src="${previewUrls[index]}" alt="${escapeHtml(file.name)}">
      <figcaption>Nova foto</figcaption>
    </figure>`).join("");
  productDialog.querySelector("#photo-preview").innerHTML = persisted + pending
    || '<p class="photo-empty">Nenhuma foto adicionada. Selecione uma imagem para este anúncio.</p>';
}

async function optimizeImage(file) {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
    throw new Error(`${file.name}: escolha uma imagem de até 15 MB.`);
  }
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`Não foi possível preparar ${file.name}.`);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const optimized = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", .72));
  if (!optimized) throw new Error(`Não foi possível otimizar ${file.name}.`);
  if (optimized.size > 2 * 1024 * 1024) throw new Error(`${file.name}: a foto otimizada excede 2 MB.`);
  return optimized;
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const error = productDialog.querySelector("#product-error");
  const status = productDialog.querySelector("#product-status");
  const formData = new FormData(form);
  const selectedFiles = [...form.querySelector("#product-photos").files];
  const currentProduct = editingId ? products.find((entry) => entry.id === editingId) : null;
  const imagePaths = [...(currentProduct ? editingImages : [])];
  error.textContent = "";
  if (imagePaths.length + selectedFiles.length > 6) {
    error.textContent = "O limite é de 6 fotos por peça.";
    return;
  }
  if (!imagePaths.length && !selectedFiles.length) {
    error.textContent = "Adicione pelo menos uma foto para a peça.";
    return;
  }
  button.disabled = true;
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
      if (!response.ok) throw new Error(uploaded.error || `Falha HTTP ${response.status} ao enviar a foto.`);
      imagePaths.push(uploaded.path);
    }
    status.hidden = false;
    status.textContent = "Salvando a peça no estoque...";
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
    await api(editingId ? `/api/products/${encodeURIComponent(editingId)}` : "/api/products", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(product),
    });
    productDialog.close();
    await openDashboard();
    showToast(editingId ? "Peça atualizada." : "Peça cadastrada.");
  } catch (saveError) {
    error.textContent = saveError.message;
    status.hidden = true;
    button.disabled = false;
  }
}

async function toggleStock(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product) return;
  try {
    await api(`/api/products/${encodeURIComponent(product.id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...product, active: product.active === false }),
    });
    await openDashboard();
    showToast(product.active === false ? "Peça marcada como disponível." : "Peça marcada sem estoque.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteProduct(productId) {
  const product = products.find((entry) => entry.id === productId);
  if (!product || !window.confirm(`Excluir "${product.title}" do estoque?`)) return;
  try {
    await api(`/api/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
    await openDashboard();
    showToast("Peça excluída.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    renderLogin();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function initialize() {
  try {
    const session = await api("/api/session");
    imageUploadsEnabled = session.imageUploadsEnabled;
    if (!session.adminEnabled) {
      renderConfiguration(`Configuração pendente: ${session.missing.join(", ")}.`);
    } else if (session.authenticated) {
      await openDashboard();
    } else {
      renderLogin();
    }
  } catch (error) {
    renderConfiguration(error.message);
  }
}

initialize();
