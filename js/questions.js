// ── QUESTION SYSTEM (JSON-DRIVEN) ─────────────────────────────

let QUESTIONS = null;

// cargar JSON
async function loadQuestions() {
    try {
        const res = await fetch('data/questions.json?nocache=' + Date.now());
        QUESTIONS = await res.json();
        renderTable();
    } catch (err) {
        console.error("Error cargando questions.json", err);
    }
}

// render tabla
function renderTable() {
    const body = document.getElementById("table-body");
    if (!body || !QUESTIONS) return;

    body.innerHTML = '';

    const max = Math.max(
        QUESTIONS.minecraft.length,
        QUESTIONS.contenido.length,
        QUESTIONS.reflexivas.length
    );

    for (let i = 0; i < max; i++) {
        const tr = document.createElement("tr");

        tr.innerHTML = `
      <td>${QUESTIONS.minecraft[i] || ""}</td>
      <td>${QUESTIONS.contenido[i] || ""}</td>
      <td>${QUESTIONS.reflexivas[i] || ""}</td>
    `;

        body.appendChild(tr);
    }
}

// random helper
function pick(arr, n) {
    return [...arr].sort(() => 0.5 - Math.random()).slice(0, n);
}

// modo normal
function generateQuestions() {
    const out = document.getElementById("output");
    out.innerHTML = "";

    Object.entries(QUESTIONS).forEach(([key, value]) => {
        if (key === "chaos") return;

        const title = document.createElement("li");
        title.textContent = "— " + key.toUpperCase() + " —";
        title.style.fontWeight = "bold";
        title.style.background = "transparent";
        title.style.border = "none";

        out.appendChild(title);

        const amount = Math.floor(Math.random() * 2) + 5;

        pick(value, amount).forEach(q => {
            const li = document.createElement("li");
            li.textContent = q;
            out.appendChild(li);
        });
    });
}

// modo caótico
function generateChaos() {
    const out = document.getElementById("output");
    out.innerHTML = "";

    // 1 por categoría
    ["minecraft", "contenido", "reflexivas"].forEach(cat => {
        pick(QUESTIONS[cat], 1).forEach(q => {
            const li = document.createElement("li");
            li.textContent = q;
            out.appendChild(li);
        });
    });

    // eventos caóticos
    pick(QUESTIONS.chaos, 2).forEach(c => {
        const li = document.createElement("li");
        li.textContent = c;
        li.style.color = "red";
        li.style.fontWeight = "bold";
        out.appendChild(li);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    loadQuestions();
    
    document.getElementById("generate")?.addEventListener("click", generateQuestions);
    document.getElementById("chaos")?.addEventListener("click", generateChaos);
});