// ============================================================
//  ORGANOGRAMA DA SAÚDE — a página. Os dados estão em dados.js
//  (estrutura) e servidores.csv (pessoas); a busca, em busca.js.
// ============================================================
(function () {
  "use strict";
  const D = window.DADOS, B = window.BUSCA;
  const $ = (s, el) => (el || document).querySelector(s);
  const main = $("#conteudo"), dlg = $("#detalhe");
  const nosPorId = Object.fromEntries(D.NOS.map((n) => [n.id, n]));
  const uniPorId = Object.fromEntries(D.UNIDADES.map((u) => [u.id, u]));

  let pessoas = [];        // agrupadas por nome: {nome, vinculos:[...]}
  let erroCsv = null;
  let indice = B.criarIndice(D, []);

  const SO_EQUIPE = ["pessoas", "canais", "quiz"];
  // ---------- modo: cidadão ou equipe ----------
  // localStorage é só conveniência: se o navegador bloquear, a página
  // funciona igual e apenas esquece a escolha.
  // A versão publicada é só a do cidadão (D.PUBLICA, gerada por publicar.js): sem a chave de modo.
  // A parte da equipe vai para trás do login, no Guia Saúde (decisão do Paulo, 18/10/2026).
  const PUBLICA = !!D.PUBLICA;
  // Dentro do Guia Saúde (D.NO_GUIA, o pacote do levar-ao-guia.js), atrás do login: SÓ o modo equipe, sem a chave
  // (Paulo, 23/10/2026: o link do cidadão e o do servidor são separados). As pessoas vêm das contas do Guia
  // (window.PESSOAS), e o alto ganha a volta ao Guia e o link para o site do cidadão, que é outro endereço.
  // A chave de modo só existe no servir.js (o ensaio local): o publicar.js e o levar-ao-guia.js a tiram do HTML.
  const NO_GUIA = !!D.NO_GUIA;
  let modo = NO_GUIA ? "equipe" : "cidadao";
  if (PUBLICA || NO_GUIA) document.querySelectorAll(".modo").forEach((m) => { m.hidden = true; });
  else try { const m = localStorage.getItem("org-modo"); if (m === "equipe" || m === "cidadao") modo = m; } catch (e) {}
  if (NO_GUIA) {
    const w = document.querySelector("header .wrap");
    if (w) w.insertAdjacentHTML("afterbegin", '<p class="voltar-guia"><a href="/inicio">← Guia Saúde</a> · <a href="https://organograma.saudesaomateusdosul.com.br" target="_blank" rel="noopener">Ver como o cidadão vê ↗</a></p>');
  }
  function aplicarModo(novo) {
    modo = novo;
    try { localStorage.setItem("org-modo", modo); } catch (e) {}
    document.body.classList.toggle("equipe", modo === "equipe");
    document.querySelectorAll(".modo button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.modo === modo)));
  }
  document.querySelectorAll(".modo button").forEach((b) =>
    b.addEventListener("click", () => {
      aplicarModo(b.dataset.modo);
      ultimaVista = null; // redesenha inteiro: exemplos e textos mudam com o modo
      const r = rotaAtual();
      if (modo === "cidadao" && SO_EQUIPE.includes(r.nome)) location.hash = "#buscar";
      else rotear();
    })
  );
  aplicarModo(modo);

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iniciais = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const areaDe = (no) => (no ? no.area : "gestao");

  function trilhaDe(no) {
    const t = [];
    let p = no && no.pai ? nosPorId[no.pai] : null;
    while (p) { t.unshift(p); p = p.pai ? nosPorId[p.pai] : null; }
    return t;
  }

  // Quem tem UNIDADE preenchida trabalha naquela unidade; não responde pelo
  // setor inteiro. Sem isso, cada enfermeiro de ESF apareceria como
  // "responsável" pelo Setor das ESF. Pelo mesmo motivo, quem tem equipe=sim
  // trabalha no setor mas não responde por ele (vai em "Equipe do setor").
  function responsaveis(idSetor) {
    const r = [];
    for (const p of pessoas) for (const v of p.vinculos)
      if (v.setor === idSetor && !v.unidade && !v.equipe && (modo === "equipe" || v.publico)) r.push({ p, v });
    return r;
  }
  function equipeDoSetor(idSetor) {
    const r = [];
    for (const p of pessoas) for (const v of p.vinculos) if (v.setor === idSetor && !v.unidade && v.equipe) r.push({ p, v });
    return r;
  }
  function daUnidade(idUni) {
    const r = [];
    for (const p of pessoas) for (const v of p.vinculos) if (v.unidade === idUni) r.push({ p, v });
    return r;
  }

  function botaoCanal(id) {
    const c = D.CANAIS[id];
    if (!c) return "";
    if (c.so === "equipe" && modo !== "equipe") return "";
    if (c.tel) return `<a class="btn urg" href="tel:${esc(c.tel)}">Ligar ${esc(c.tel)} <small>${esc(c.nome.replace(/\s*\d+$/, ""))}</small></a>`;
    if (c.email) return `<a class="btn forte" href="mailto:${esc(c.email)}">${esc(c.curto)} <small>${esc(c.email)}</small></a>`;
    if (c.link) return `<a class="btn forte" href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.rotuloLink || c.nome)} ↗</a>`;
    return "";
  }

  // Telefone vira link de discar: é no celular que a pessoa está quando precisa.
  const soDigitos = (t) => String(t).replace(/\D/g, "");
  const telHref = (t) => "tel:" + (soDigitos(t).length <= 4 ? soDigitos(t) : "+55" + soDigitos(t));
  const telLink = (t) => `<a href="${telHref(t)}">${esc(t)}</a>`;
  function blocoLocal(l, compacto) {
    const partes = [];
    if (l.rotulo && !compacto) partes.push(`<b>${esc(l.rotulo)}</b>`);
    if (l.endereco) partes.push(`📍 ${esc(l.endereco)}`);
    if (l.telefone) partes.push(`📞 ${telLink(l.telefone)}${l.telefone2 ? " ou " + telLink(l.telefone2) : ""}${l.whatsapp ? " (também WhatsApp)" : ""}`);
    // Posto sem telefone (Lajeadinho, Lageado, Pontilhão): o caminho é a Secretaria (Paulo, 14/10/2026).
    if (l.semTelefone) partes.push(`📞 Sem telefone no posto: fale com a Secretaria de Saúde, ${telLink("(42) 3912-7081")}`);
    if (l.whatsappNum) partes.push(`💬 WhatsApp ${telLink(l.whatsappNum)}`);
    if (l.email) partes.push(`✉️ <a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`);
    if (l.horario) partes.push(`🕒 ${esc(l.horario)}`);
    if (l.sede) partes.push(`📅 Na sede: ${esc(l.sede)}`);
    return partes.length ? `<div class="local">${partes.map((p) => `<div>${p}</div>`).join("")}</div>` : "";
  }
  const locaisDe = (id) => (D.LOCAIS && D.LOCAIS[id]) || [];

  function cartaoSetor(no) {
    const quem = responsaveis(no.id);
    const info = modo === "equipe" ? (no.equipe || no.publico) : no.publico;
    const loc = locaisDe(no.id)[0];
    return `<article class="setor" data-area="${areaDe(no)}" data-abrir="${no.id}">
      <span class="area">${esc(D.AREAS[no.area].nome)}</span>
      <button class="nm" type="button" data-abrir="${no.id}">${esc(no.nome)}</button>
      <p class="oq">${esc(no.oque)}</p>
      ${no.tipo !== "departamento" && info && info.texto && info.texto !== no.oque ? `<p class="oq" style="color:var(--ink)">${esc(info.texto)}</p>` : ""}
      ${quem.length ? `<p class="quem"><b>Responsável:</b> ${esc([...new Set(quem.map((x) => x.p.nome))].join(", "))}</p>` : ""}
      ${(no.naoE || []).map((n) => `<p class="naoe"><b>Atenção:</b> ${esc(n.texto)}</p>`).join("")}
      ${loc ? blocoLocal(loc, true) : ""}
    </article>`;
  }

  // ---------- CSV das pessoas ----------
  // O Paulo edita no Excel. O Excel brasileiro salva com ";" e, se ninguém
  // escolher "CSV UTF-8", em Windows-1252: os dois casos são aceitos.
  function decodificar(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); }
  }
  function lerCsv(txt) {
    txt = txt.replace(/^﻿/, "");
    const primeira = txt.split(/\r?\n/)[0] || "";
    const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
    const linhas = [];
    let campo = "", linha = [], aspas = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (aspas) {
        if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && txt[i + 1] === "\n") i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = "";
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    const cab = (linhas.shift() || []).map((h) => B.normalizar(h));
    return linhas
      .filter((l) => l.some((c) => c.trim()))
      .map((l) => Object.fromEntries(cab.map((h, i) => [h, (l[i] || "").trim()])));
  }
  // "setor" e "unidade" aceitam o código (esf, caf, rosas) OU o nome
  // escrito do jeito que a pessoa escreveria ("Farmácia", "Rosas").
  function acharId(valor, lista, campos) {
    if (!valor) return "";
    const v = B.normalizar(valor);
    for (const it of lista) if (it.id === v || it.id === v.replace(/ /g, "-")) return it.id;
    for (const it of lista) for (const c of campos) if (it[c] && B.normalizar(it[c]) === v) return it.id;
    for (const it of lista) for (const c of campos) if (it[c] && B.normalizar(it[c]).includes(v)) return it.id;
    return "";
  }
  async function carregarPessoas() {
    if (Array.isArray(window.PESSOAS)) {
      // No Guia: já montadas no servidor (src/lib/organograma/pessoas.ts), no mesmo formato do CSV agrupado.
      pessoas = window.PESSOAS.map((p) => ({ nome: String(p.nome || ""), vinculos: (p.vinculos || []).map((v) => ({
        funcao: v.funcao || "", setor: v.setor || "", unidade: v.unidade || "", papel: v.papel || "", setorEscrito: v.setorEscrito || "",
        publico: !!v.publico, equipe: !!v.equipe })) }));
      indice = B.criarIndice(D, pessoas.map((p) => ({ nome: p.nome, cargo: p.vinculos.map((v) => v.funcao).join(" "),
        papel: p.vinculos.map((v) => [v.papel, nosPorId[v.setor] && nosPorId[v.setor].curto].join(" ")).join(" "), _p: p })));
      return;
    }
    try {
      const r = await fetch("servidores.csv", { cache: "no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const linhas = lerCsv(decodificar(await r.arrayBuffer()));
      const porNome = new Map();
      for (const l of linhas) {
        if (!l.nome) continue;
        const setor = acharId(l.setor, D.NOS, ["curto", "nome"]);
        const unidade = acharId(l.unidade, D.UNIDADES, ["nome"]);
        const chave = B.normalizar(l.nome);
        if (!porNome.has(chave)) porNome.set(chave, { nome: l.nome, vinculos: [] });
        porNome.get(chave).vinculos.push({ funcao: l.funcao || l.cargo || "", setor, unidade, papel: l.papel || "", setorEscrito: l.setor,
          publico: /^s/i.test(l.publico || ""), equipe: /^s/i.test(l.equipe || "") });
      }
      // Ordem do CSV, que é a da hierarquia (Secretário antes da assessoria): é ela que o
      // organograma mostra. A aba Pessoas é que ordena por nome.
      pessoas = [...porNome.values()];
    } catch (e) {
      erroCsv = e;
      pessoas = [];
    }
    indice = B.criarIndice(D, pessoas.map((p) => ({
      nome: p.nome,
      cargo: p.vinculos.map((v) => v.funcao).join(" "),
      papel: p.vinculos.map((v) => [v.papel, nosPorId[v.setor] && nosPorId[v.setor].curto].join(" ")).join(" "),
      _p: p,
    })));
  }

  // ---------- rotas ----------
  function rotaAtual() {
    const h = location.hash.replace(/^#/, "");
    const [caminho, qs] = h.split("?");
    const [nome, arg] = decodeURIComponent(caminho || "buscar").split("/");
    const q = new URLSearchParams(qs || "").get("q") || "";
    return { nome: nome || "buscar", arg, q };
  }
  function marcarNav(nome) {
    document.querySelectorAll("nav a").forEach((a) => {
      if (a.dataset.rota === nome) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  let ultimaVista = null;
  function rotear() {
    const r = rotaAtual();
    let nome = r.nome;
    if (nome === "setor") {
      // Setor abre como painel POR CIMA da vista em que a pessoa estava.
      if (!ultimaVista) { ultimaVista = "org"; desenhar("org", r); }
      abrirSetor(r.arg);
      return;
    }
    if (SO_EQUIPE.includes(nome) && modo !== "equipe") nome = "buscar";
    if (!VISTAS[nome]) nome = "buscar";
    if (dlg.open) dlg.close();
    desenhar(nome, r);
  }
  function desenhar(nome, r) {
    // Redesenhar a busca a cada tecla apagaria o que a pessoa digita.
    if (nome === "buscar" && ultimaVista === "buscar" && $("#q")) { mostrarResultado(r.q); marcarNav(nome); return; }
    ultimaVista = nome;
    marcarNav(nome);
    VISTAS[nome](r);
  }
  window.addEventListener("hashchange", rotear);

  // ---------- vista: BUSCAR ----------
  const EXEMPLOS = {
    cidadao: ["onde tomo vacina", "remédio de alto custo", "consulta em Curitiba", "dor de dente", "estou grávida", "foco de dengue", "quero reclamar", "fisioterapia"],
    equipe: ["tirar férias", "quebrou o ar condicionado", "folha ponto", "notificar caso suspeito", "paciente para assistente social", "falta de material", "Jaqueline", "remédio de alto custo"],
  };
  const lupa = `<svg class="lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

  function vistaBuscar(r) {
    main.innerHTML = `
      <label class="sr" for="q">O que você precisa?</label>
      <div class="caixa">${lupa}
        <input id="q" type="search" autocomplete="off" enterkeyhint="search"
          placeholder="${modo === "equipe" ? "Ex.: tirar férias, conserto, notificar, nome de alguém…" : "O que você precisa? Ex.: vacina, remédio, dentista…"}">
        <button class="limpar" type="button" aria-label="Limpar">×</button>
      </div>
      <div class="exemplos"><span>Experimente:</span>${EXEMPLOS[modo].map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div>
      <div id="res" aria-live="polite"></div>`;
    const inp = $("#q"), caixa = $(".caixa");
    inp.value = r.q;
    caixa.classList.toggle("tem", !!r.q);
    let t;
    inp.addEventListener("input", () => {
      caixa.classList.toggle("tem", !!inp.value);
      clearTimeout(t);
      t = setTimeout(() => {
        const alvo = "#buscar" + (inp.value.trim() ? "?q=" + encodeURIComponent(inp.value) : "");
        history.replaceState(null, "", alvo);
        mostrarResultado(inp.value);
      }, 140);
    });
    $(".limpar").addEventListener("click", () => { inp.value = ""; inp.dispatchEvent(new Event("input")); inp.focus(); });
    main.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { inp.value = b.dataset.ex; inp.dispatchEvent(new Event("input")); }));
    mostrarResultado(r.q);
    if (!r.q && matchMedia("(pointer:fine)").matches) inp.focus();
  }

  // A resposta de uma pergunta de PERGUNTAS, com os canais, os telefones e os setores de destino.
  // Usada pela busca e pelo fim do passo a passo.
  function blocoResposta(p) {
    const canais = [p.canal, p.extra].filter(Boolean).map(botaoCanal).join("");
    const destinos = (p.destinos || []).map((id) => nosPorId[id]).filter(Boolean)
      .filter((n) => modo === "equipe" || n.publico)
      .map((n) => `<button class="chip" data-abrir="${n.id}">${esc(n.curto)} →</button>`).join("");
    const ligar = (p.destinos || []).map((id) => nosPorId[id]).filter((n) => n && (modo === "equipe" || n.publico))
      .map((n) => ({ n, l: locaisDe(n.id).find((l) => l.telefone) })).filter((x) => x.l).slice(0, 2)
      .map((x) => `<a class="btn" href="${telHref(x.l.telefone)}">📞 ${esc(x.n.curto)} <small>${esc(x.l.telefone)}</small></a>`).join("");
    return `<section class="resposta">
        <p class="rot">${modo === "equipe" && p.para !== "equipe" ? "Para orientar o usuário" : "Resposta"}</p>
        <p class="txt">${esc(p.resposta)}</p>
        ${canais || destinos || ligar ? `<div class="acoes">${canais}${ligar}${destinos}</div>` : ""}
      </section>`;
  }

  function mostrarResultado(q) {
    const res = $("#res");
    if (!res) return;
    if (!q || !q.trim()) { res.innerHTML = inicioBusca(); return; }
    const R = B.buscar(indice, q, modo);
    let h = "";
    if (R.resposta) {
      h += blocoResposta(R.resposta);
      if (R.alternativas.length) {
        h += `<div class="tambem"><p class="entendi">Talvez você quis dizer também:</p>${R.alternativas.map((a) =>
          `<details><summary>${esc(a.termos[0][0].toUpperCase() + a.termos[0].slice(1))}</summary><p>${esc(a.resposta)}</p>
          <div class="acoes lista-links">${[a.canal].filter(Boolean).map(botaoCanal).join("")}${(a.destinos || []).map((id) => nosPorId[id]).filter(Boolean).filter((n) => modo === "equipe" || n.publico).map((n) => `<button class="chip" data-abrir="${n.id}">${esc(n.curto)} →</button>`).join("")}</div></details>`).join("")}</div>`;
      }
    }
    // "Moro no Palmital": quando a pergunta cita uma localidade ou ponto de apoio pelo nome, a
    // resposta é a unidade que atende ali — é a dúvida mais comum de quem é do interior.
    if (!R.resposta && R.unidades.length) {
      const qn = " " + B.normalizar(q) + " ";
      for (const u of R.unidades) {
        const lugar = [...(u.localidades || []), ...(u.pontos || []).map((p) => p.nome)]
          .find((l) => qn.includes(" " + B.normalizar(l) + " "));
        if (!lugar) continue;
        const tel = u.telefone ? `<a class="btn" href="${telHref(u.telefone)}">📞 ${esc(u.telefone)}</a>` : "";
        h += `<section class="resposta"><p class="rot">Resposta</p>
          <p class="txt">Quem mora em ${esc(lugar)} é atendido pela ${esc(u.nome)}.</p>
          <div class="acoes">${tel}<a class="btn" href="#unidades">Ver a unidade →</a></div></section>`;
        break;
      }
    }
    const nada = !R.resposta && !R.setores.length && !R.pessoas.length && !R.unidades.length && !R.papeis.length;
    if (nada) {
      h += `<div class="nada">
        <p><b>Não encontrei nada para “${esc(q)}”.</b></p>
        <p>Tente com outras palavras (ex.: “remédio” em vez do nome do remédio) ou veja o <a href="#org">organograma completo</a>.</p>
        <p>Se ainda assim não souber a quem recorrer, a Secretaria encaminha:</p>
        <div class="lista-links">${botaoCanal("emailSMS")}</div>
      </div>`;
    }
    if (R.pessoas.length) {
      h += `<h3>Pessoas</h3><div class="tabela">${R.pessoas.map((x) => linhaPessoa(x._p)).join("")}</div>`;
    }
    if (R.setores.length) h += `<h3>${R.resposta ? "Onde" : "Serviços e setores"}</h3><div class="grade">${R.setores.map(cartaoSetor).join("")}</div>`;
    if (R.unidades.length) h += `<h3>Unidades de Saúde</h3><div class="grade">${R.unidades.map(cartaoUnidade).join("")}</div>`;
    if (R.papeis.length && !R.resposta) h += `<h3>Profissões</h3><div class="grade">${R.papeis.map(cartaoPapel).join("")}</div>`;
    res.innerHTML = h;
  }

  function inicioBusca() {
    const deps = D.NOS.filter((n) => n.tipo === "departamento");
    const topo = modo === "equipe"
      ? `<h3>Quem recebe o quê</h3><div class="grade">${["rhSaude", "emailRH", "oxy", "sigss", "emailSMS"].map(cartaoCanal).join("")}</div>`
      : `<h3>Precisa agora?</h3><div class="grade">
          <div class="canal"><span class="nm">Emergência com risco de vida</span><p>Dor no peito, falta de ar, acidente grave, desmaio.</p><div class="ac">${botaoCanal("samu")}<button class="btn" data-abrir="pa">Pronto Atendimento 24h →</button></div></div>
          <div class="canal"><span class="nm">Consulta, vacina, remédio, exame</span><p>Comece pela Unidade de Saúde da Família do seu bairro ou localidade.</p><div class="ac"><a class="btn forte" href="#unidades">Ver as 12 unidades</a></div></div>
          <div class="canal"><span class="nm">Reclamar, sugerir ou elogiar</span><p>Ouvidoria do SUS: telefone 156, com sigilo e resposta em até 30 dias.</p><div class="ac">${botaoCanal("ouvidoria")}</div></div>
        </div>`;
    return `${topo}<h3>Os departamentos</h3><div class="grade">${deps.map(cartaoSetor).join("")}</div>`;
  }

  // ---------- vista: ORGANOGRAMA (árvore) ----------
  // Secretaria → Conselho, Diretoria e Ouvidoria → os 6 departamentos (lado a lado) → os setores de
  // cada um (em lista) → as 12 unidades, dentro do Setor das ESF. Na tela larga, a árvore fica numa
  // "tela" que se arrasta e aproxima; no celular, o CSS a transforma em lista recuada.
  const filhosDe = (pai) => D.NOS.filter((n) => n.pai === pai);
  function caixa(n, cls, extra) {
    const quem = [...new Set(responsaveis(n.id).map((x) => x.p.nome))];
    return `<div class="cx ${cls || ""}" data-area="${n.area}" data-no="${n.id}"><button class="abre" type="button" data-abrir="${n.id}">${esc(n.curto)}${quem.length ? `<small>${esc(quem.join(", "))}</small>` : ""}</button>${extra || ""}</div>`;
  }
  const botaoAlterna = (qtd, aberto) => `<button class="mais" type="button" data-alterna data-qtd="${qtd}" aria-expanded="${aberto}" aria-label="${aberto ? "Fechar" : "Abrir"} os ${qtd} de baixo">${qtd} ${aberto ? "▾" : "▸"}</button>`;
  function arvoreHtml() {
    const setor = (n) => n.id === "esf"
      ? `<li class="fechado">${caixa(n, "", botaoAlterna(D.UNIDADES.length, false))}<ul class="v">${D.UNIDADES.map((u) =>
          `<li><div class="cx uni-no" data-area="ab" data-uni="${u.id}"><button class="abre" type="button" data-ir-uni="${u.id}">${esc(u.nome)}</button></div></li>`).join("")}</ul></li>`
      : `<li>${caixa(n)}</li>`;
    const dep = (d) => {
      const fs = filhosDe(d.id);
      return `<li>${caixa(d, "dep", fs.length ? botaoAlterna(fs.length, true) : "")}${fs.length ? `<ul class="v">${fs.map(setor).join("")}</ul>` : ""}</li>`;
    };
    // Conselho e Ouvidoria ficam ao lado da Secretaria (tracejado), como no organograma dos slides.
    return `<ul class="h"><li><div class="lat-linha">${caixa(nosPorId.cms, "topo lateral")}<span class="tr"></span>${caixa(nosPorId.sms, "topo")}<span class="tr"></span>${caixa(nosPorId.ouvidoria, "topo lateral")}</div>
      <ul class="h"><li>${caixa(nosPorId.diretoria, "topo")}
        <ul class="h">${filhosDe("diretoria").map(dep).join("")}</ul></li></ul>
    </li></ul>`;
  }
  function alternar(li, aberto) {
    li.classList.toggle("fechado", !aberto);
    const b = li.querySelector(":scope > .cx [data-alterna]");
    if (b) { const q = b.dataset.qtd; b.textContent = `${q} ${aberto ? "▾" : "▸"}`; b.setAttribute("aria-expanded", String(aberto)); b.setAttribute("aria-label", `${aberto ? "Fechar" : "Abrir"} os ${q} de baixo`); }
  }
  let camera = null; // {x, y, s}: guardada enquanto a página está aberta, para voltar do painel no mesmo lugar
  function vistaOrg() {
    main.innerHTML = `
      <h2>Organograma da Secretaria Municipal de Saúde</h2>
      <p class="intro">Toque numa caixa para ver o que o setor faz, quem responde por ele e como chegar. O botão com o número, ao lado da caixa, abre e fecha o que está embaixo.</p>
      <div class="arv-barra">
        <input id="achar" type="search" autocomplete="off" placeholder="Achar no organograma: vacina, CAPS, ${modo === "equipe" ? "um nome, " : ""}Rosas…" aria-label="Achar no organograma">
        <div class="zoom"><button type="button" data-z="mais" aria-label="Aproximar">+</button><button type="button" data-z="menos" aria-label="Afastar">−</button><button type="button" data-z="ajustar">Ajustar</button><button type="button" data-z="abrir">Abrir tudo</button><button type="button" data-z="fechar">Fechar tudo</button></div>
      </div>
      <p class="arv-dica">Arraste para mover. Para aproximar: os botões + e −, Ctrl + rodinha do mouse, ou dois dedos.</p>
      <div class="legenda">${Object.entries(D.AREAS).filter(([k]) => k !== "gestao").map(([k, a]) => `<span data-area="${k}"><i></i>${esc(a.nome)}</span>`).join("")}</div>
      <div class="arv-tela" id="tela"><div class="arv" id="arv">${arvoreHtml()}</div></div>`;
    const tela = $("#tela"), arv = $("#arv");
    const larga = () => matchMedia("(min-width:761px)").matches;
    const aplicar = () => { arv.style.transform = larga() && camera ? `translate(${camera.x}px,${camera.y}px) scale(${camera.s})` : ""; };
    const ajustar = () => {
      // a árvore pode já ter sido trocada por outra (as pessoas chegaram e a vista foi redesenhada): largura 0, nada a fazer
      if (!larga() || !arv.isConnected || !arv.offsetWidth) return;
      const s = Math.min(1, (tela.clientWidth - 16) / arv.offsetWidth);
      camera = { s, x: (tela.clientWidth - arv.offsetWidth * s) / 2, y: 8 };
      aplicar();
    };
    const zoomEm = (f, cx, cy) => {
      if (!camera) return;
      const ns = Math.min(2, Math.max(0.3, camera.s * f));
      camera.x = cx - (cx - camera.x) * (ns / camera.s);
      camera.y = cy - (cy - camera.y) * (ns / camera.s);
      camera.s = ns;
      aplicar();
    };
    const centrar = (el) => {
      if (!larga()) { el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      if (!camera) ajustar();
      const a = arv.getBoundingClientRect(), r = el.getBoundingClientRect();
      const ex = (r.left - a.left) / camera.s + r.width / camera.s / 2, ey = (r.top - a.top) / camera.s + r.height / camera.s / 2;
      camera.s = Math.max(camera.s, 0.85);
      camera.x = tela.clientWidth / 2 - ex * camera.s;
      camera.y = tela.clientHeight / 2 - ey * camera.s;
      aplicar();
    };

    // botões
    main.querySelector(".zoom").addEventListener("click", (e) => {
      const z = e.target.closest("[data-z]");
      if (!z) return;
      const c = [tela.clientWidth / 2, tela.clientHeight / 2];
      if (z.dataset.z === "mais") zoomEm(1.25, ...c);
      else if (z.dataset.z === "menos") zoomEm(0.8, ...c);
      else if (z.dataset.z === "ajustar") ajustar();
      else { arv.querySelectorAll("li").forEach((li) => { if (li.querySelector(":scope > .cx [data-alterna]")) alternar(li, z.dataset.z === "abrir"); }); ajustar(); }
    });
    arv.addEventListener("click", (e) => {
      const t = e.target.closest("[data-alterna]");
      if (t) { e.stopPropagation(); const li = t.closest("li"); alternar(li, li.classList.contains("fechado")); return; }
      const u = e.target.closest("[data-ir-uni]");
      if (u) location.hash = "#mapa/" + u.dataset.irUni;
    });

    // arrastar e aproximar (um dedo/mouse arrasta; dois dedos aproximam)
    const toques = new Map();
    let arrastou = false, ini = null;
    tela.addEventListener("pointerdown", (e) => {
      if (!larga()) return;
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
      arrastou = false; ini = { x: e.clientX, y: e.clientY };
    });
    tela.addEventListener("pointermove", (e) => {
      if (!toques.has(e.pointerId) || !camera) return;
      const ant = toques.get(e.pointerId);
      if (toques.size === 1) {
        if (!arrastou && Math.hypot(e.clientX - ini.x, e.clientY - ini.y) < 5) return;
        if (!arrastou) { arrastou = true; tela.classList.add("arrastando"); try { tela.setPointerCapture(e.pointerId); } catch (x) {} }
        camera.x += e.clientX - ant.x; camera.y += e.clientY - ant.y; aplicar();
      } else if (toques.size === 2) {
        const [p1, p2] = [...toques.entries()].map(([id, p]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : p));
        const [q1, q2] = [...toques.values()];
        const d0 = Math.hypot(q1.x - q2.x, q1.y - q2.y), d1 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const b = tela.getBoundingClientRect();
        if (d0 > 0) zoomEm(d1 / d0, (p1.x + p2.x) / 2 - b.left, (p1.y + p2.y) / 2 - b.top);
        arrastou = true;
      }
      toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const solta = (e) => { toques.delete(e.pointerId); if (!toques.size) tela.classList.remove("arrastando"); };
    tela.addEventListener("pointerup", solta);
    tela.addEventListener("pointercancel", solta);
    // depois de arrastar, o clique que o navegador dispara ao soltar não abre a caixa
    tela.addEventListener("click", (e) => { if (arrastou) { e.stopPropagation(); e.preventDefault(); arrastou = false; } }, true);
    tela.addEventListener("wheel", (e) => {
      if (!larga() || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const b = tela.getBoundingClientRect();
      zoomEm(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - b.left, e.clientY - b.top);
    }, { passive: false });

    // achar: acende o que a busca encontra e o caminho até ele
    let t;
    $("#achar").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => acender(e.target.value), 160); });
    function acender(q) {
      arv.querySelectorAll(".acesa,.caminho").forEach((x) => x.classList.remove("acesa", "caminho"));
      arv.classList.toggle("filtrando", !!q.trim());
      if (!q.trim()) return;
      const R = B.buscar(indice, q, modo);
      const nos = new Set([...(R.resposta ? R.resposta.destinos || [] : []), ...R.setores.slice(0, 3).map((s) => s.id)]);
      const unis = new Set(R.unidades.map((u) => u.id));
      for (const p of R.pessoas.slice(0, 3)) for (const v of p._p.vinculos) v.unidade ? unis.add(v.unidade) : v.setor && nos.add(v.setor);
      const alvos = [...arv.querySelectorAll(".cx")].filter((c) => nos.has(c.dataset.no) || unis.has(c.dataset.uni));
      for (const c of alvos) {
        c.classList.add("acesa");
        // sobe pelos ramos: cada caixa acima é "caminho", e o ramo fechado que esconde o alvo abre
        for (let li = c.closest("li"); li && arv.contains(li); li = li.parentElement.closest("li")) {
          const cx = li.querySelector(":scope > .cx");
          if (cx === c) continue;
          if (cx) cx.classList.add("caminho");
          if (li.classList.contains("fechado")) alternar(li, true);
        }
      }
      if (alvos[0]) requestAnimationFrame(() => centrar(alvos[0]));
    }

    requestAnimationFrame(() => { if (!arv.isConnected) return; if (camera && larga()) aplicar(); else ajustar(); });
    reaplicarOrg = () => { if (camera && larga()) aplicar(); else if (larga()) ajustar(); else aplicar(); };
  }
  let reaplicarOrg = () => {};
  window.addEventListener("resize", () => { if (ultimaVista === "org") reaplicarOrg(); });

  // ---------- vista: PASSO A PASSO ----------
  // O caminho inteiro fica no endereço (#passo/consulta~=crianca), então o "voltar" do navegador
  // funciona e o link pode ser mandado para alguém. "=id" é uma resposta de PERGUNTAS.
  function vistaPasso(r) {
    const segs = (r.arg || "").split("~").filter(Boolean);
    const trilha = [];
    let atual = "inicio";
    for (const s of segs) {
      const op = ((D.PASSOS[atual] || {}).opcoes || []).find((o) => o.ir === s || "=" + o.resposta === s);
      if (!op) break;
      trilha.push(op.rotulo);
      if (op.ir) atual = op.ir;
    }
    const ultimo = segs[segs.length - 1] || "inicio";
    const ir = (seg) => "#passo/" + [...segs, seg].map(encodeURIComponent).join("~");
    let h = trilha.length ? `<p class="trilho">Você escolheu: ${trilha.map((t) => `<b>${esc(t)}</b>`).join(" › ")}</p>` : "";
    if (ultimo.startsWith("=")) {
      const p = D.PERGUNTAS.find((x) => x.id === ultimo.slice(1));
      if (p) {
        const nos = (p.destinos || []).map((id) => nosPorId[id]).filter((n) => n && (modo === "equipe" || n.publico));
        h += blocoResposta(p) + (nos.length ? `<h3>Onde</h3><div class="grade">${nos.map(cartaoSetor).join("")}</div>` : "");
      } else h += `<p class="nada">Não encontrei essa resposta. Recomece ou digite a sua dúvida na busca.</p>`;
    } else {
      const passo = D.PASSOS[ultimo] || D.PASSOS.inicio;
      const ops = passo.opcoes.filter((o) => o.para !== "equipe" || modo === "equipe");
      h += `<p class="pg">${esc(passo.pergunta)}</p>${passo.ajuda ? `<p class="ajuda">${esc(passo.ajuda)}</p>` : ""}
        <div class="opcoes">${ops.map((o) => `<a class="opcao" href="${o.link || ir(o.ir || "=" + o.resposta)}"><span class="em" aria-hidden="true">${o.em}</span><span>${esc(o.rotulo)}</span></a>`).join("")}</div>`;
    }
    const nav = segs.length
      ? `<div class="passo-nav"><a class="btn" href="${segs.length > 1 ? "#passo/" + segs.slice(0, -1).map(encodeURIComponent).join("~") : "#passo"}">← Voltar</a><a class="btn" href="#passo">Recomeçar</a><a class="btn" href="#buscar">Prefiro digitar</a></div>`
      : `<div class="passo-nav"><a class="btn" href="#buscar">Prefiro digitar a minha dúvida</a></div>`;
    main.innerHTML = `<h2>Passo a passo</h2>
      <p class="intro">Não sabe o que digitar? Responda com um toque e chegue ao lugar certo.</p>
      <div class="passo">${h}${nav}</div>`;
    if (main.getBoundingClientRect().top < 0) main.scrollIntoView();
  }

  // ---------- vista: QUIZ (equipe) ----------
  // Para treinar servidor novo: "por onde se pede isso?". As perguntas e as respostas certas vêm
  // de dados.js (QUIZ), e a explicação de cada uma é o texto que a própria página já mostra.
  let quiz = null;
  const embaralhar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const novoQuiz = () => { quiz = { ordem: embaralhar(D.QUIZ.map((_, i) => i)), i: 0, acertos: 0, opcoes: null, resp: null }; };
  function explicacaoQuiz(q) {
    if (q.ver) { const p = D.PERGUNTAS.find((x) => x.id === q.ver); return { texto: p.resposta, nos: p.destinos || [] }; }
    const n = nosPorId[q.explica.no];
    return { texto: n[q.explica.lado].texto, nos: [n.id] };
  }
  function vistaQuiz() { if (!quiz) novoQuiz(); desenharQuiz(); }
  function desenharQuiz() {
    const total = quiz.ordem.length;
    let h;
    if (quiz.i >= total) {
      let recorde = 0;
      try { recorde = +localStorage.getItem("org-quiz-recorde") || 0; if (quiz.acertos > recorde) localStorage.setItem("org-quiz-recorde", String(quiz.acertos)); } catch (e) {}
      const msg = quiz.acertos === total ? "Gabaritou! Você sabe o caminho de tudo." : quiz.acertos >= total * 0.7 ? "Muito bem: você conhece os caminhos." : "Vale rever as respostas: elas estão todas na busca e no organograma.";
      h = `<p class="fim">${quiz.acertos} de ${total}</p><p>${esc(msg)}</p>
        ${recorde && quiz.acertos <= recorde ? `<p class="entendi">Seu recorde neste aparelho: ${recorde} de ${total}.</p>` : quiz.acertos > recorde ? `<p class="entendi">Novo recorde neste aparelho.</p>` : ""}
        <div class="passo-nav"><button class="btn forte" type="button" data-quiz="denovo">Jogar de novo</button><a class="btn" href="#canais">Ver os canais</a></div>`;
    } else {
      const q = D.QUIZ[quiz.ordem[quiz.i]];
      if (!quiz.opcoes) quiz.opcoes = embaralhar(q.opcoes.map((t, k) => ({ t, certa: k === 0 })));
      const respondida = quiz.resp !== null;
      const ex = respondida ? explicacaoQuiz(q) : null;
      h = `<div class="placar"><span>Pergunta ${quiz.i + 1} de ${total} · ${quiz.acertos} acerto(s)</span><span class="barra"><i style="width:${(quiz.i / total) * 100}%"></i></span></div>
        <p class="pg">${esc(q.p)}</p>
        <div class="opcoes">${quiz.opcoes.map((o, k) => {
          const cls = respondida ? (o.certa ? "certa" : k === quiz.resp ? "errada" : "") : "";
          return `<button class="opcao ${cls}" type="button" data-quiz="${k}" ${respondida ? "disabled" : ""}><span class="em" aria-hidden="true">${respondida ? (o.certa ? "✅" : k === quiz.resp ? "❌" : "▫️") : "▫️"}</span><span>${esc(o.t)}</span></button>`;
        }).join("")}</div>
        ${respondida ? `<section class="resposta explica"><p class="rot">${quiz.opcoes[quiz.resp].certa ? "Isso mesmo" : "Não é bem assim"}</p><p class="txt">${esc(ex.texto)}</p>
          <div class="acoes">${ex.nos.map((id) => nosPorId[id]).filter(Boolean).map((n) => `<button class="chip" data-abrir="${n.id}">${esc(n.curto)} →</button>`).join("")}</div></section>
          <div class="passo-nav"><button class="btn forte" type="button" data-quiz="proxima">${quiz.i + 1 < total ? "Próxima →" : "Ver o resultado"}</button></div>` : ""}`;
    }
    main.innerHTML = `<h2>Quiz: por onde se pede?</h2>
      <p class="intro">Perguntas rápidas sobre os caminhos da Secretaria, para treinar quem está chegando. As respostas são as mesmas da busca.</p>
      <div class="passo quiz">${h}</div>`;
    main.querySelectorAll("[data-quiz]").forEach((b) => b.addEventListener("click", () => {
      const v = b.dataset.quiz;
      if (v === "denovo") novoQuiz();
      else if (v === "proxima") { quiz.i++; quiz.opcoes = null; quiz.resp = null; }
      else if (quiz.resp === null) { quiz.resp = +v; if (quiz.opcoes[quiz.resp].certa) quiz.acertos++; }
      desenharQuiz();
      const alvo = main.querySelector(v === "proxima" || v === "denovo" ? ".pg, .fim" : ".explica");
      if (alvo && alvo.getBoundingClientRect().bottom > innerHeight) alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
  }

  // ---------- vista: MAPA ----------
  // Leaflet (cdnjs) e o mapa do OpenStreetMap, carregados só quando alguém abre o mapa: quem só usa
  // a busca, no posto com sinal ruim, não paga por eles. Posições em dados.js (LUGARES e UNIDADES).
  let promessaLeaflet = null, mapa = null;
  function carregarLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (!promessaLeaflet) promessaLeaflet = new Promise((ok, erro) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      js.onload = () => ok(window.L);
      js.onerror = () => { promessaLeaflet = null; erro(new Error("sem Leaflet")); };
      document.head.appendChild(js);
    });
    return promessaLeaflet;
  }
  // Um alfinete por prédio: os setores que dividem o endereço (a Secretaria tem oito) ficam juntos.
  function pontosDoMapa() {
    const pts = [];
    for (const [id, lg] of Object.entries(D.LUGARES)) {
      const locs = Object.entries(D.LOCAIS).flatMap(([setor, ls]) => ls.filter((l) => l.lugar === id).map((l) => ({ setor, l })));
      const setores = [...new Set(locs.map((x) => x.setor))].map((s) => nosPorId[s]).filter(Boolean);
      const unis = D.UNIDADES.filter((u) => u.lugar === id);
      const area = (setores.find((n) => n.tipo !== "topo") || setores[0] || { area: "gestao" }).area;
      pts.push({ id: "l:" + id, geo: lg.geo, nome: lg.nome, area, locs, setores, unis });
    }
    for (const u of D.UNIDADES) if (u.geo) pts.push({ id: "u:" + u.id, geo: u.geo, nome: u.nome, area: "ab", uni: u });
    return pts;
  }
  function popupDoPonto(p) {
    if (p.uni) {
      const u = p.uni;
      return `<b>${esc(u.nome)}</b>${blocoLocal(u, true)}${u.semEndereco ? `<div class="local" style="color:var(--muted)">Zona rural, sem endereço de rua.</div>` : ""}
        ${u.pontos && u.pontos.length ? `<div class="local">🏠 Também atende em: ${u.pontos.map((x) => esc(x.nome) + (x.dias ? ` (médico: ${esc(x.dias)})` : "")).join(", ")}</div>` : ""}
        ${equipeDaUnidade(u)}
        <div class="acoes"><a class="chip" href="https://www.google.com/maps/dir/?api=1&destination=${u.geo.join(",")}" target="_blank" rel="noopener">Como chegar ↗</a></div>`;
    }
    const tels = [...new Map(p.locs.filter((x) => x.l.telefone).map((x) => [x.l.telefone, x.l])).values()];
    const end = (p.locs.find((x) => x.l.endereco) || { l: {} }).l.endereco;
    const setores = p.setores.filter((n) => modo === "equipe" || n.publico);
    return `<b>${esc(p.nome)}</b>${end ? `<div class="local">📍 ${esc(end)}</div>` : ""}
      ${tels.length ? `<div class="local">${tels.map((l) => `<div>📞 ${l.rotulo ? esc(l.rotulo) + ": " : ""}${telLink(l.telefone)}</div>`).join("")}</div>` : ""}
      ${p.unis.length ? `<div class="local">Aqui funciona também a ${p.unis.map((u) => esc(u.nome)).join(", ")}.</div>` : ""}
      <div class="acoes">${setores.map((n) => `<button class="chip" data-abrir="${n.id}">${esc(n.curto)} →</button>`).join("")}<a class="chip" href="https://www.google.com/maps/dir/?api=1&destination=${p.geo.join(",")}" target="_blank" rel="noopener">Como chegar ↗</a></div>`;
  }
  function vistaMapa(r) {
    if (NO_GUIA) {
      // A CSP do Guia (a porta de entrada de todos os sistemas) não aceita o Leaflet do cdnjs nem os ladrilhos do
      // OpenStreetMap: o mapa fica no site do cidadão (desenho, §5).
      const ir = "https://organograma.saudesaomateusdosul.com.br/#mapa" + (r.arg ? "/" + encodeURIComponent(r.arg) : "");
      main.innerHTML = `<h2>Mapa da saúde</h2><p class="intro">O mapa das unidades e dos serviços fica no site do Organograma, aberto a todos.</p>
        <div class="lista-links"><a class="btn forte" href="${esc(ir)}" target="_blank" rel="noopener">Abrir o mapa ↗</a></div>`;
      return;
    }
    const semGeo = D.UNIDADES.filter((u) => !u.geo && !u.lugar);
    main.innerHTML = `
      <h2>Mapa da saúde</h2>
      <p class="intro">As 12 unidades de saúde e os serviços da Secretaria. Toque num ponto para ver endereço, telefone e o que funciona ali.</p>
      <div class="arv-barra"><input id="onde" type="search" autocomplete="off" placeholder="Onde você mora? Ex.: Palmital, Vila Verde, Faxinal dos Elias…" aria-label="Onde você mora"></div>
      <div id="onde-res" aria-live="polite"></div>
      <div class="mapa-legenda"><span data-area="ab"><i></i>Unidades de Saúde da Família</span>${["gestao", "adm", "vig", "esp", "ue"].map((k) => `<span data-area="${k}"><i></i>${esc(D.AREAS[k].nome)}</span>`).join("")}</div>
      <div class="mapa-caixa" id="mapa"><p class="intro" style="padding:16px">Carregando o mapa…</p></div>
      ${semGeo.length ? `<p class="sem-mapa">Ainda sem lugar no mapa (a coordenação está conferindo): ${semGeo.map((u) => `<b>${esc(u.nome)}</b>${u.endereco ? " – " + esc(u.endereco) : ""}`).join("; ")}. Veja em <a href="#unidades">Unidades de Saúde</a>.</p>` : ""}
      <p class="fonte">Posições conferidas no Google Maps em 18/10/2026. Mapa © colaboradores do OpenStreetMap.</p>`;
    const pts = pontosDoMapa();
    carregarLeaflet().then((L) => {
      if (ultimaVista !== "mapa" || !$("#mapa")) return;
      if (mapa) { mapa.remove(); mapa = null; }
      const caixa = $("#mapa");
      caixa.innerHTML = "";
      mapa = L.map(caixa, { scrollWheelZoom: false, tap: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© colaboradores do OpenStreetMap" }).addTo(mapa);
      const marcas = {};
      for (const p of pts) {
        const icone = L.divIcon({ className: "", html: `<span class="pino ${p.uni ? "uni" : ""}" data-area="${p.area}"></span>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });
        marcas[p.id] = L.marker(p.geo, { icon: icone, title: p.nome, alt: p.nome }).addTo(mapa)
          .bindTooltip(esc(p.nome), { direction: "top", offset: [0, -10] })
          .bindPopup(() => popupDoPonto(p), { maxWidth: 300 });
      }
      mapa.fitBounds(L.latLngBounds(pts.map((p) => p.geo)), { padding: [24, 24] });
      const focar = (id) => {
        const u = uniPorId[id];
        const chave = u && u.lugar ? "l:" + u.lugar : "u:" + id;
        const m = marcas[chave];
        if (!m) return false;
        mapa.setView(m.getLatLng(), 14);
        m.openPopup();
        return true;
      };
      if (r.arg) focar(r.arg);
      let t;
      $("#onde").addEventListener("input", (e) => {
        clearTimeout(t);
        t = setTimeout(() => {
          const q = e.target.value, saida = $("#onde-res");
          if (!q.trim()) { saida.innerHTML = ""; return; }
          const R = B.buscar(indice, q, modo);
          const qn = " " + B.normalizar(q) + " ";
          let achou = null, lugar = null;
          for (const u of R.unidades) {
            lugar = [...(u.localidades || []), ...(u.pontos || []).map((x) => x.nome)].find((l) => qn.includes(" " + B.normalizar(l) + " "));
            if (lugar || !achou) achou = u;
            if (lugar) break;
          }
          if (!achou) { saida.innerHTML = `<p class="entendi">Não achei esse lugar. Tente o nome da comunidade ou do bairro, ou pergunte ao seu agente comunitário de saúde.</p>`; return; }
          saida.innerHTML = `<p class="entendi">${lugar ? `Quem mora em <b>${esc(lugar)}</b> é atendido pela <b>${esc(achou.nome)}</b>.` : `Achei a <b>${esc(achou.nome)}</b>.`}${focar(achou.id) ? "" : " Ela ainda não tem lugar no mapa: veja em Unidades de Saúde."}</p>`;
        }, 250);
      });
    }).catch(() => {
      const c = $("#mapa");
      if (c) c.innerHTML = `<p class="intro" style="padding:16px">Não consegui carregar o mapa (sem internet?). Os endereços estão em <a href="#unidades">Unidades de Saúde</a>.</p>`;
    });
  }

  // ---------- vista: UNIDADES ----------
  // A equipe de cada unidade vem do Planifica Fácil e do AvaliaACS (ver CLAUDE.md), agrupada por
  // função e sempre nesta ordem. O cidadão vê só as contagens; os nomes ficam no modo equipe.
  const ORDEM_FUNCAO = ["Enfermeiro", "Médico", "Cirurgião", "Técnico(a) de Enfermagem", "Auxiliar de Enfermagem", "Agente Comunitário", "Auxiliar em Saúde Bucal"];
  const rankFuncao = (f) => { const i = ORDEM_FUNCAO.findIndex((o) => f.startsWith(o)); return i < 0 ? 99 : i; };
  function porFuncao(xs) {
    const grupos = new Map();
    for (const x of xs) {
      const f = x.v.funcao || "Outros";
      if (!grupos.has(f)) grupos.set(f, []);
      grupos.get(f).push(x);
    }
    return [...grupos.entries()].sort((a, b) => rankFuncao(a[0]) - rankFuncao(b[0]));
  }
  function equipeDaUnidade(u) {
    const ord = porFuncao(daUnidade(u.id));
    // Na versão pública não vão nomes: publicar.js grava só a contagem por função (u.contagem).
    if (!ord.length && u.contagem) return `<div class="gente" style="color:var(--muted)">Equipe: ${Object.entries(u.contagem).sort((a, b) => rankFuncao(a[0]) - rankFuncao(b[0])).map(([f, n]) => `${n} ${esc(f.replace(" (ACS)", "").replace("Agente Comunitário de Saúde", "ACS"))}`).join(" · ")}</div>`;
    if (!ord.length) return "";
    if (modo !== "equipe") {
      return `<div class="gente" style="color:var(--muted)">Equipe: ${ord.map(([f, xs]) => `${xs.length} ${esc(f.replace(" (ACS)", "").replace("Agente Comunitário de Saúde", "ACS"))}`).join(" · ")}</div>`;
    }
    return `<div class="gente">${ord.map(([f, xs]) => `<div style="margin-top:6px"><b>${esc(f)}</b><br>${xs.map((x) => {
      const micro = (x.v.papel.match(/Microárea: (.+)\.$/) || [])[1];
      return esc(x.p.nome) + (micro ? ` <span style="color:var(--muted)">· ${esc(micro)}</span>` : "");
    }).join("<br>")}</div>`).join("")}</div>`;
  }
  function cartaoUnidade(u) {
    return `<div class="uni">
      <div class="z">${u.zona === "rural" ? "Rural / ribeirinha" : "Urbana"}</div>
      <div class="nm">${esc(u.nome)}</div>
      ${blocoLocal(u, true)}
      ${u.semEndereco ? `<div class="local" style="color:var(--muted)">Zona rural, sem endereço de rua.</div>` : ""}
      ${!u.endereco && !u.semEndereco ? `<div class="local" style="color:var(--muted)">Localização a confirmar.</div>` : ""}
      ${(() => {
        const ja = new Set((u.pontos || []).map((p) => p.nome));
        const ls = (u.localidades || []).filter((l) => !ja.has(l));
        return ls.length ? `<div class="local">📌 Localidades: ${ls.map(esc).join(", ")}</div>` : "";
      })()}
      ${u.pontos && u.pontos.length ? `<div class="local">🏠 Também atende em: ${u.pontos.map((p) => esc(p.nome) + (p.onde ? ` <small style='color:var(--muted)'>(${esc(p.onde)})</small>` : "") + (p.dias ? ` <small style='color:var(--muted)'>(médico: ${esc(p.dias)})</small>` : "") + (p.aConfirmar && modo === "equipe" ? " <small style='color:var(--muted)'>(a confirmar)</small>" : "")).join(", ")}</div>` : ""}
      ${equipeDaUnidade(u)}
    </div>`;
  }
  function vistaUnidades() {
    const rur = D.UNIDADES.filter((u) => u.zona === "rural"), urb = D.UNIDADES.filter((u) => u.zona === "urbana");
    const esf = nosPorId.esf;
    main.innerHTML = `
      <h2>As 12 Unidades de Saúde da Família</h2>
      <p class="intro">${esc(esf.publico.texto)} ${modo === "equipe" ? "" : "Se não sabe qual é a sua, pergunte ao seu agente comunitário de saúde ou na unidade mais próxima."}</p>
      <div class="lista-links" style="margin-bottom:6px"><button class="btn" data-abrir="esf">Sobre o Setor das ESF →</button></div>
      <h3>Urbanas (${urb.length})</h3><div class="grade">${urb.map(cartaoUnidade).join("")}</div>
      <h3>Rurais e ribeirinhas (${rur.length})</h3><div class="grade">${rur.map(cartaoUnidade).join("")}</div>
      <h3 id="laboratorios">Laboratórios credenciados para coleta</h3>
      <p class="intro" style="font-size:15px"><b>Exame de laboratório:</b> nos postos da cidade, agende na própria unidade. No interior não há coleta no posto: entregue o pedido no seu posto; ele vai ao TFD, e a guia liberada volta ao posto para você agendar a coleta. A coleta é feita num destes laboratórios. Confirme o horário de coleta por telefone.</p>
      <div class="grade">${(D.LABORATORIOS || []).map((l) => `<div class="uni" style="border-left-color:var(--esp)"><div class="nm">${esc(l.nome)}</div>${blocoLocal(l, true)}</div>`).join("")}</div>
      <p class="intro" style="font-size:15px">À noite, no fim de semana e em urgência: <b>Pronto Atendimento Municipal, 24 horas</b> — Rua Dr. Paulo Fortes, 25 – Centro, ${telLink("(42) 3912-7066")}.</p>`;
  }

  // ---------- vista: PAPÉIS ----------
  function cartaoPapel(p) {
    const onde = p.onde.map((id) => nosPorId[id]).filter(Boolean);
    return `<div class="papel">
      <div class="nm">${esc(p.nome)}</div>
      <p class="rs">${esc(p.resumo)}</p>
      <ul>${p.faz.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      ${p.obs ? `<p class="obs">${esc(p.obs)}</p>` : ""}
      <div class="onde">${onde.map((n) => `<button class="chip" data-abrir="${n.id}">${esc(n.curto)}</button>`).join("")}</div>
      <p class="fonte">${p.fonte === "pnab" ? "Base: Política Nacional de Atenção Básica (PNAB). O regimento de cada unidade detalha." : "Descrição geral do cargo. O regimento de cada serviço detalha."}</p>
    </div>`;
  }
  function vistaPapeis() {
    main.innerHTML = `
      <h2>Quem faz o quê</h2>
      <p class="intro">O papel de cada profissional nos serviços de saúde — para o cidadão saber a quem pedir, e para a equipe saber o que cabe a cada um.</p>
      <div class="filtro"><input id="fp" type="search" placeholder="Filtrar: enfermeiro, ACS, dentista…" aria-label="Filtrar profissões"></div>
      <div class="grade" id="lp">${D.PAPEIS.map(cartaoPapel).join("")}</div>`;
    $("#fp").addEventListener("input", (e) => {
      const q = e.target.value.trim();
      const lista = q ? B.buscar(B.criarIndice(D, []), q, "equipe").papeis : D.PAPEIS;
      $("#lp").innerHTML = lista.length ? lista.map(cartaoPapel).join("") : `<p class="intro">Nenhuma profissão encontrada.</p>`;
    });
  }

  // ---------- vista: PESSOAS (equipe) ----------
  function linhaPessoa(p) {
    return `<div class="pessoa">
      <div class="av" data-area="${areaDe(nosPorId[p.vinculos[0].setor])}">${esc(iniciais(p.nome))}</div>
      <div><div class="n">${esc(p.nome)}</div>
        ${p.vinculos.map((v) => {
          const s = nosPorId[v.setor], u = uniPorId[v.unidade];
          return `<div class="f">${esc(v.funcao)}${s ? ` · <button class="chip" style="padding:0 9px;font-size:13.5px" data-abrir="${s.id}">${esc(s.curto)}</button>` : v.setorEscrito ? ` · ${esc(v.setorEscrito)}` : ""}${u ? ` · ${esc(u.nome)}` : ""}</div>
            ${v.papel ? `<div class="p">${esc(v.papel)}</div>` : ""}`;
        }).join("")}
      </div></div>`;
  }
  function vistaPessoas() {
    const aviso = erroCsv
      ? `<p class="aviso">Não consegui ler a lista de servidores (servidores.csv). Abra a página pelo endereço publicado ou por <code>node servir.js</code>, não direto do arquivo.</p>`
      : "";
    main.innerHTML = `
      <h2>Pessoas</h2>
      <p class="intro">Quem responde por cada setor e quem trabalha em cada setor e unidade. ${NO_GUIA ? "A lista vem das contas do Guia Saúde: a ficha de cada pessoa." : "A lista vem do arquivo <b>servidores.csv</b>, que a coordenação mantém."}</p>
      ${aviso}
      <div class="filtro">
        <input id="fpes" type="search" placeholder="Buscar por nome, função ou setor" aria-label="Buscar pessoa">
        <select id="fset" aria-label="Filtrar por setor ou unidade"><option value="">Todos os setores e unidades</option>
          <optgroup label="Unidades de Saúde">${D.UNIDADES.map((u) => `<option value="u:${u.id}">${esc(u.nome)}</option>`).join("")}</optgroup>
          <optgroup label="Setores">${D.NOS.filter((n) => n.tipo === "setor").map((n) => `<option value="${n.id}">${esc(n.curto)}</option>`).join("")}</optgroup>
        </select>
      </div>
      <div class="tabela" id="lpes"></div>
      <p class="intro" style="margin-top:14px;font-size:14.5px">${pessoas.length} pessoa(s) cadastrada(s). Faltou alguém? Mande a correção para a coordenação da APS.</p>`;
    const pintar = () => {
      const q = B.normalizar($("#fpes").value), s = $("#fset").value;
      const lista = [...pessoas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).filter((p) =>
        (!s || p.vinculos.some((v) => (s.startsWith("u:") ? v.unidade === s.slice(2) : v.setor === s))) &&
        (!q || B.normalizar([p.nome, ...p.vinculos.map((v) => [v.funcao, v.papel, nosPorId[v.setor] && nosPorId[v.setor].nome, uniPorId[v.unidade] && uniPorId[v.unidade].nome].join(" "))].join(" ")).includes(q)));
      $("#lpes").innerHTML = lista.length ? lista.map(linhaPessoa).join("") : `<p class="intro" style="padding:10px 0">Ninguém encontrado.</p>`;
    };
    $("#fpes").addEventListener("input", pintar);
    $("#fset").addEventListener("change", pintar);
    pintar();
  }

  // ---------- vista: CANAIS (equipe) ----------
  function cartaoCanal(id) {
    const c = D.CANAIS[id];
    return `<div class="canal"><span class="nm">${esc(c.nome)}</span><p>${esc(c.para)}</p><div class="ac">${botaoCanal(id)}</div></div>`;
  }
  function vistaCanais() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let proxima = null;
    const dias = D.AGENDA.map((a) => {
      const d = new Date(a.data + "T00:00:00");
      const passou = d < hoje;
      if (!passou && !proxima) proxima = a.data;
      return { ...a, d, passou };
    });
    const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const sem = (d) => d.toLocaleDateString("pt-BR", { weekday: "long" });
    main.innerHTML = `
      <h2>Canais de comunicação</h2>
      <p class="intro">Cada tipo de demanda tem o seu caminho. Mandar pelo canal certo é o que faz a demanda chegar.</p>
      <div class="grade">${["rhSaude", "emailRH", "oxy", "sigss", "emailSMS", "encaminha", "ouvidoria", "suaVoz"].filter((id) => D.CANAIS[id]).map(cartaoCanal).join("")}</div>
      ${dias.length ? `<h3>Reuniões de coordenadores</h3>
      <div class="agenda">${dias.map((a) => `<div class="dia ${a.passou ? "passou" : ""} ${a.data === proxima ? "proxima" : ""}"><b>${fmt(a.d)}</b><small>${esc(sem(a.d))}${a.data === proxima ? " · próxima" : ""}</small></div>`).join("")}</div>` : ""}
      ${(D.LEMBRETES || []).length ? `<h3>Lembretes da coordenação</h3>
      <div class="grade">${D.LEMBRETES.map((l) => `<div class="canal"><span class="nm">${esc(l.titulo)}</span><p>${esc(l.texto)}</p>${l.link ? `<div class="ac"><a class="btn" href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.rotuloLink || "Abrir")} ↗</a></div>` : ""}</div>`).join("")}</div>` : ""}`;
  }

  const VISTAS = { buscar: vistaBuscar, passo: vistaPasso, quiz: vistaQuiz, org: vistaOrg, mapa: vistaMapa, unidades: vistaUnidades, papeis: vistaPapeis, pessoas: vistaPessoas, canais: vistaCanais };

  // ---------- painel de detalhe ----------
  function abrirSetor(id) {
    const n = nosPorId[id];
    if (!n) { location.hash = "#org"; return; }
    const trilha = trilhaDe(n);
    const filhos = D.NOS.filter((x) => x.pai === n.id && !x.lateral);
    const quem = responsaveis(n.id);
    const papeis = D.PAPEIS.filter((p) => p.onde.includes(n.id));
    const pub = n.publico, eq = n.equipe;
    let corpo = `<div class="bloco"><p class="rot">O que é</p><p>${esc(n.oque)}</p></div>`;
    if (pub && pub.texto) corpo += `<div class="bloco"><p class="rot">${modo === "equipe" ? "Para orientar o cidadão" : "Para você"}</p><p>${esc(pub.texto)}</p>${pub.canal ? `<div class="lista-links" style="margin-top:10px">${botaoCanal(pub.canal)}</div>` : ""}</div>`;
    if (!pub && modo !== "equipe") corpo += `<div class="bloco"><p class="rot">Para você</p><p>É um setor interno da Secretaria, sem atendimento direto ao público. Na dúvida, fale com a Secretaria.</p><div class="lista-links" style="margin-top:10px">${botaoCanal("emailSMS")}</div></div>`;
    if (modo === "equipe" && eq && eq.texto) corpo += `<div class="bloco"><p class="rot">Para a equipe</p><p>${esc(eq.texto)}</p>${eq.canal ? `<div class="lista-links" style="margin-top:10px">${botaoCanal(eq.canal)}</div>` : ""}</div>`;
    const locs = locaisDe(n.id);
    if (locs.length) corpo += `<div class="bloco"><p class="rot">Onde fica</p>${locs.map((l) => blocoLocal(l, false)).join("")}<p class="fonte">Fonte: site da Prefeitura e coordenação da APS.</p></div>`;
    for (const x of n.naoE || []) corpo += `<p class="naoe" style="margin-top:12px"><b>Não é aqui:</b> ${esc(x.texto)} <button class="chip" data-abrir="${x.ir}">${esc(nosPorId[x.ir].curto)} →</button></p>`;
    if (modo === "equipe" || quem.length) {
      corpo += `<div class="bloco" data-area="${n.area}"><p class="rot">Quem responde</p>${quem.length
        ? quem.map(({ p, v }) => `<div class="pessoa"><div class="av">${esc(iniciais(p.nome))}</div><div><div class="n">${esc(p.nome)}</div><div class="f">${esc(v.funcao)}${uniPorId[v.unidade] ? " · " + esc(uniPorId[v.unidade].nome) : ""}</div>${v.papel ? `<div class="p">${esc(v.papel)}</div>` : ""}</div></div>`).join("")
        : `<p style="color:var(--muted)">${esc(n.semResponsavel || "Ainda sem nome cadastrado no servidores.csv.")}</p>`}</div>`;
    }
    const eqs = modo === "equipe" ? equipeDoSetor(n.id) : [];
    if (eqs.length) corpo += `<div class="bloco" data-area="${n.area}"><p class="rot">Equipe do setor (${eqs.length})</p><div class="gente">${porFuncao(eqs).map(([f, xs]) =>
      `<div style="margin-top:6px"><b>${esc(f)}</b><br>${xs.map((x) => esc(x.p.nome) + (x.v.papel ? ` <span style="color:var(--muted)">· ${esc(x.v.papel.replace(/.$/, ""))}</span>` : "")).join("<br>")}</div>`).join("")}</div></div>`;
    if (filhos.length) corpo += `<div class="bloco"><p class="rot">${n.tipo === "departamento" ? "Setores" : "Abaixo"}</p><div class="lista-links">${filhos.map((f) => `<button class="chip" data-abrir="${f.id}">${esc(f.curto)}</button>`).join("")}</div></div>`;
    if (n.id === "esf") corpo += `<div class="bloco"><p class="rot">As 12 unidades</p><ul>${D.UNIDADES.map((u) => `<li>${esc(u.nome)} <span style="color:var(--muted);font-size:14px">· ${u.zona === "rural" ? "rural" : "urbana"}</span></li>`).join("")}</ul></div>`;
    if (papeis.length) corpo += `<div class="bloco"><p class="rot">Profissionais que atuam aqui</p><ul>${papeis.map((p) => `<li><b>${esc(p.nome)}</b> — ${esc(p.resumo)}</li>`).join("")}</ul><div class="lista-links" style="margin-top:8px"><a class="chip" href="#papeis">Ver o papel de cada um →</a></div></div>`;

    dlg.innerHTML = `<div class="painel" data-area="${n.area}">
      <div class="cab">
        <p class="trilha">${trilha.map((t) => `<button data-abrir="${t.id}">${esc(t.curto)}</button>`).join(" › ")}</p>
        <span class="area" style="margin-top:6px">${esc(D.AREAS[n.area].nome)}</span>
        <h2 id="det-titulo">${esc(n.nome)}</h2>
        <button class="fechar" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="corpo">${corpo}</div></div>`;
    if (!dlg.open) dlg.showModal();
    $(".painel", dlg).scrollTop = 0;
    $(".fechar", dlg).focus();
  }
  function fecharPainel() {
    if (!dlg.open) return;
    dlg.close();
  }
  dlg.addEventListener("close", () => {
    if (rotaAtual().nome === "setor") history.replaceState(null, "", "#" + (ultimaVista || "org") + (ultimaVista === "buscar" && $("#q") && $("#q").value ? "?q=" + encodeURIComponent($("#q").value) : ""));
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest(".fechar")) fecharPainel();
  });

  // Qualquer [data-abrir] da página abre o setor.
  document.addEventListener("click", (e) => {
    if (e.target.closest("a[href]") && !e.target.closest("a[data-abrir]")) return;
    const b = e.target.closest("[data-abrir]");
    if (!b) return;
    e.preventDefault();
    location.hash = "#setor/" + b.dataset.abrir;
  });

  // ---------- início ----------
  rotear();
  carregarPessoas().then(() => {
    // Redesenha só o que depende de pessoas, sem apagar a busca em andamento.
    const r = rotaAtual();
    if (r.nome === "buscar" && $("#q")) mostrarResultado($("#q").value);
    // o mapa monta os balões na hora do toque, já com as pessoas: redesenhá-lo só recarregaria os ladrilhos
    else if (r.nome === "mapa") {}
    // Com as pessoas, as caixas do organograma ganham os nomes e a árvore alarga: o zoom é refeito.
    else if (r.nome !== "setor") { ultimaVista = null; camera = null; rotear(); }
    else abrirSetor(r.arg);
  });
})();
