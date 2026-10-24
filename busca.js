// ============================================================
//  A BUSCA QUE ENTENDE — sem IA paga, sem servidor, custo zero.
//
//  Ela não procura a palavra exata: tira acento, entende plural,
//  perdoa erro de digitação ("ferías", "vacna") e reconhece o jeito
//  de perguntar de cada um ("quebrou o ar", "preciso tirar férias",
//  "remédio caro"). O "entendimento" mora em dados.js (PERGUNTAS e
//  palavras de cada setor): quanto mais jeitos de perguntar estiverem
//  lá, mais esperta ela fica. É ali que se ensina, não aqui.
//
//  Puro (não toca na página) para poder ser testado no Node.
// ============================================================

(function (raiz) {
  "use strict";

  // Palavras que não dizem o que a pessoa quer — só como ela fala.
  const VAZIAS = new Set(("a o as os um uma uns umas de da do das dos em no na nos nas para pra pro por com sem " +
    "e ou que se eu me meu minha meus minhas seu sua voce ele ela isso esse essa este esta aqui ali la " +
    "quero queria preciso precisa precisando gostaria como onde qual quais quem quando porque pq tem ter " +
    "fazer faco faz ir vou vai sobre ao aos ja nao sim tipo coisa algum alguma mais muito bom dia tarde noite oi ola favor").split(" "));
  // "noite" é vazia no texto livre, mas entra em frase ("de noite") pelo casamento de frase inteira.

  function normalizar(t) {
    return String(t || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Raiz leve do português: o bastante para plural e gênero, sem
  // transformar "médico" em "medicamento".
  function raizDe(p) {
    if (p.length <= 3) return p;
    if (p.endsWith("coes")) return p.slice(0, -4) + "cao";
    if (p.endsWith("oes") || p.endsWith("aes")) return p.slice(0, -3) + "ao";
    if (p.endsWith("ais")) return p.slice(0, -3) + "al";
    if (p.endsWith("eis")) return p.slice(0, -3) + "el";
    if (p.endsWith("ns")) return p.slice(0, -2) + "m";
    if (p.endsWith("s") && !p.endsWith("ss") && p.length > 4) return p.slice(0, -1);
    return p;
  }

  function palavras(t, tirarVazias) {
    const ps = normalizar(t).split(" ").filter(Boolean);
    return (tirarVazias ? ps.filter((p) => !VAZIAS.has(p)) : ps).map(raizDe);
  }

  function distancia(a, b, teto) {
    if (Math.abs(a.length - b.length) > teto) return teto + 1;
    let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let menor = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < menor) menor = cur[j];
      }
      if (menor > teto) return teto + 1;
      ant = cur;
    }
    return ant[b.length];
  }

  // Quão bem a palavra digitada (q) casa com a palavra conhecida (k): 0 a 1.
  function casa(q, k) {
    if (q === k) return 1;
    const menor = Math.min(q.length, k.length);
    // Prefixo: "vacin" acha "vacina"/"vacinacao"; mas "medic" não acha
    // "medicamento" a partir de "medico" (diferença de tamanho > 3).
    if (menor >= 4 && Math.abs(q.length - k.length) <= 3) {
      let i = 0;
      while (i < menor && q[i] === k[i]) i++;
      if (i >= menor - 1 && i >= 4) return 0.9;
    }
    // Quem digita no celular erra letra: 1 erro a partir de 5 letras, 2 a partir de 8.
    if (menor >= 5) {
      const teto = menor >= 8 ? 2 : 1;
      if (distancia(q, k, teto) <= teto) return 0.8;
    }
    return 0;
  }

  function melhorCasamento(q, lista) {
    let m = 0;
    for (const k of lista) {
      const c = casa(q, k);
      if (c > m) m = c;
      if (m === 1) break;
    }
    return m;
  }

  // Nota de um "termo" (frase conhecida) contra a pergunta.
  function notaTermo(qNorm, qPalavras, termo) {
    const tNorm = normalizar(termo);
    if (!tNorm) return 0;
    const tPal = palavras(tNorm, true);
    // Frase inteira dentro da pergunta: o sinal mais forte.
    // Empate entre duas frases inteiras: vence a que aparece ANTES na pergunta —
    // em "goteira na sala de vacina" o assunto é a goteira, não a vacina.
    const pos = (" " + qNorm + " ").indexOf(" " + tNorm + " ");
    if (pos >= 0) return 10 + tPal.length * 2 + (1 - pos / (qNorm.length + 1)) * 0.9;
    if (!tPal.length || !qPalavras.length) return 0;
    let soma = 0;
    for (const tp of tPal) soma += melhorCasamento(tp, qPalavras);
    const fracao = soma / tPal.length;
    if (fracao >= 0.99) return 6 + tPal.length * 2;
    if (fracao >= 0.8 && tPal.length > 1) return 5 + tPal.length;
    if (tPal.length === 1) return fracao * 6;
    // Frase longa com metade das palavras: pista fraca, mas pista.
    return fracao >= 0.5 ? fracao * 4 : 0;
  }

  function notaLista(qNorm, qPalavras, termos) {
    let melhor = 0, soma = 0;
    for (const t of termos) {
      const n = notaTermo(qNorm, qPalavras, t);
      if (n > melhor) melhor = n;
      soma += n;
    }
    // O melhor termo decide; os outros só desempatam, e pouco — senão quem
    // cadastrou mais variações da mesma palavra ganharia por volume.
    return melhor + Math.min(soma - melhor, 4) * 0.05;
  }

  // Monta o índice uma vez só (dados + pessoas do CSV).
  function criarIndice(dados, pessoas) {
    const nosPorId = Object.fromEntries(dados.NOS.map((n) => [n.id, n]));
    const unidadesPorId = Object.fromEntries(dados.UNIDADES.map((u) => [u.id, u]));
    const setores = dados.NOS.map((n) => ({
      tipo: "setor", id: n.id, ref: n,
      termos: [n.nome, n.curto, ...(n.palavras || [])],
      texto: [n.oque, n.publico && n.publico.texto, n.equipe && n.equipe.texto].filter(Boolean).join(" "),
    }));
    const unidades = dados.UNIDADES.map((u) => ({
      tipo: "unidade", id: u.id, ref: u,
      termos: [u.nome, u.nome.replace(/^ESF (Rural |Vila )?/, ""), u.id.replace(/-/g, " "), ...(u.pontos || []).map((p) => p.nome), ...(u.localidades || [])],
    }));
    const perguntas = dados.PERGUNTAS.map((p) => ({ tipo: "pergunta", id: p.id, ref: p, termos: p.termos }));
    const papeis = dados.PAPEIS.map((p) => ({
      tipo: "papel", id: p.id, ref: p,
      termos: [p.nome, ...p.nome.split(/[\/(),]| e /).map((s) => s.trim()).filter((s) => s.length > 2)],
      texto: [p.resumo, ...p.faz].join(" "),
    }));
    const gente = (pessoas || []).map((p, i) => ({
      tipo: "pessoa", id: "p" + i, ref: p,
      termos: [p.nome, p.nome.split(" ")[0], p.cargo].filter(Boolean),
      texto: p.papel || "",
    }));
    return { dados, nosPorId, unidadesPorId, setores, unidades, perguntas, papeis, gente };
  }

  // Palavras do texto descritivo contam pouco: ajudam a achar algo quando
  // nada mais casou, sem passar na frente de um sinônimo cadastrado.
  function notaTexto(qPalavras, texto) {
    if (!texto || !qPalavras.length) return 0;
    const tp = palavras(texto, true);
    let acertos = 0;
    for (const q of qPalavras) if (q.length >= 4 && melhorCasamento(q, tp) >= 0.9) acertos++;
    return (acertos / qPalavras.length) * 3;
  }

  // publico: "cidadao" | "equipe"
  function buscar(indice, consulta, publico) {
    const qNorm = normalizar(consulta);
    const qPal = palavras(consulta, true);
    const vazio = { consulta, entendi: [], resposta: null, alternativas: [], setores: [], unidades: [], papeis: [], pessoas: [] };
    if (!qNorm || (!qPal.length && qNorm.length < 2)) return vazio;
    const palQ = qPal.length ? qPal : palavras(consulta, false);

    const pontuar = (lista, comTexto) =>
      lista
        .map((it) => ({ it, nota: notaLista(qNorm, palQ, it.termos) + (comTexto ? notaTexto(palQ, it.texto) : 0) }))
        .filter((x) => x.nota >= 3)
        .sort((a, b) => b.nota - a.nota);

    const vale = (p) => p.para === "todos" || (publico === "equipe" ? true : p.para === "publico");
    const perg = pontuar(indice.perguntas.filter((p) => vale(p.ref)), false);

    let resposta = null, alternativas = [];
    if (perg.length && perg[0].nota >= 4.5) {
      resposta = perg[0].it.ref;
      alternativas = perg.slice(1, 4).filter((x) => x.nota >= perg[0].nota * 0.6).map((x) => x.it.ref);
    }

    // Setores: os que a resposta aponta vêm primeiro; depois os que a busca achou.
    const setoresAchados = pontuar(indice.setores, true)
      .filter((x) => publico === "equipe" || x.it.ref.publico)
      .map((x) => x.it.ref);
    const ordem = [];
    const por = (id) => indice.nosPorId[id];
    if (resposta) for (const id of resposta.destinos || []) if (por(id)) ordem.push(por(id));
    for (const s of setoresAchados) if (!ordem.includes(s)) ordem.push(s);

    const unidades = pontuar(indice.unidades, false).slice(0, 4).map((x) => x.it.ref);
    const papeis = pontuar(indice.papeis, true).slice(0, 4).map((x) => x.it.ref);
    const pessoas = publico === "equipe" ? pontuar(indice.gente, true).slice(0, 8).map((x) => x.it.ref) : [];

    return { consulta, entendi: palQ, resposta, alternativas, setores: ordem.slice(0, 6), unidades, papeis, pessoas };
  }

  const API = { normalizar, raizDe, palavras, distancia, casa, criarIndice, buscar };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else raiz.BUSCA = API;
})(typeof window !== "undefined" ? window : globalThis);
