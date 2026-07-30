import type {
  AgentProjection,
  AgentRequest,
  AgentResponse,
  CodegenPayload,
} from "./contracts.js";
import type { Agent } from "./agent.js";

export class TodoDemoAgent implements Agent {
  project(request: AgentRequest): AgentProjection {
    const multiplier = request.tier === "frontier" ? 2 : request.tier === "mid" ? 1 : 0.5;
    return {
      maxCostUsd: 0.08 * multiplier,
      maxTokens: Math.round(10_000 * multiplier),
    };
  }

  async invoke(request: AgentRequest): Promise<AgentResponse> {
    const payload = this.#payload(request);
    const output = JSON.stringify(payload);
    return {
      payload,
      usage: {
        input: Math.min(900, Math.ceil(request.contextSnapshot.length / 4)),
        output: Math.ceil(output.length / 4),
        costUsd:
          request.tier === "cheap"
            ? 0.008
            : request.tier === "frontier"
              ? 0.04
              : 0.02,
      },
    };
  }

  #payload(request: AgentRequest): unknown {
    switch (request.taskKind) {
      case "testgen":
        return {
          tests: [
            {
              id: "todo-unit",
              title: "Todo operations pass their unit tests",
              command: process.execPath,
              args: ["--test", "test/todo.test.mjs"],
              cwd: "product",
            },
            {
              id: "todo-syntax",
              title: "Browser module has valid JavaScript syntax",
              command: process.execPath,
              args: ["--check", "app.mjs"],
              cwd: "product",
            },
            {
              id: "todo-static-preview",
              title: "Static preview contains the application entry points",
              command: process.execPath,
              args: ["scripts/verify-preview.mjs"],
              cwd: "product",
            },
          ],
        };
      case "codegen":
        return DEMO_PRODUCT;
      case "critique":
        return { violations: [], flags: [] };
      case "adr_draft":
        return {
          title: "Ship the single-user todo demo",
          context:
            "The v1 gating demonstration must prove the bounded ship loop without platform or product authentication.",
          decision:
            "Ship a static, single-user todo application after generated checks pass and the founder approves the gate.",
          alternativesRejected: [
            "Add authentication to the gating demonstration.",
            "Use an unmetered implementation path outside the ship loop.",
          ],
          consequences: [
            "The demo proves test generation, bounded repair, critique, gate capture, preview deployment, ADR creation, and terminal evaluation.",
            "The auth variant remains a separate non-gating benchmark.",
          ],
        };
      case "narrate":
      case "judge":
        return {};
    }
  }
}

const DEMO_PRODUCT: CodegenPayload = {
  files: [
    {
      path: "product/package.json",
      content: `{
  "name": "tailered-todo-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
`,
    },
    {
      path: "product/index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Tasks</title>
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <main>
      <header>
        <p class="eyebrow">Today</p>
        <h1>Tasks</h1>
        <p id="summary">0 open</p>
      </header>
      <form id="todo-form">
        <label for="todo-title">New task</label>
        <div class="entry">
          <input id="todo-title" name="title" autocomplete="off" required maxlength="120">
          <button type="submit">Add</button>
        </div>
      </form>
      <ul id="todo-list" aria-live="polite"></ul>
    </main>
    <script type="module" src="./app.mjs"></script>
  </body>
</html>
`,
    },
    {
      path: "product/styles.css",
      content: `:root {
  color: #17211b;
  background: #f5f3ed;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-synthesis: none;
}

* { box-sizing: border-box; }

body { margin: 0; }

main {
  width: min(42rem, calc(100% - 2rem));
  margin: 6rem auto;
}

header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: end;
  border-bottom: 1px solid #cbc9c1;
  padding-bottom: 1rem;
}

h1, p { margin: 0; }

h1 { font-size: clamp(2.5rem, 8vw, 5rem); letter-spacing: -0.06em; }

.eyebrow {
  grid-column: 1 / -1;
  color: #276044;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

form { margin: 2rem 0; }

label { display: block; margin-bottom: 0.5rem; font-weight: 650; }

.entry { display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; }

input, button {
  border: 1px solid #8b8e87;
  border-radius: 0.25rem;
  font: inherit;
  padding: 0.8rem 0.9rem;
}

button {
  color: white;
  background: #276044;
  border-color: #276044;
  cursor: pointer;
}

ul { list-style: none; margin: 0; padding: 0; }

li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.8rem;
  align-items: center;
  border-top: 1px solid #d9d7cf;
  padding: 1rem 0;
}

li[data-completed="true"] .title { color: #70736d; text-decoration: line-through; }

.remove { color: #7a2929; background: transparent; border-color: transparent; }
`,
    },
    {
      path: "product/app.mjs",
      content: `export function addTodo(todos, title, id = crypto.randomUUID()) {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new TypeError("Todo title is required.");
  return [...todos, { id, title: cleanTitle, completed: false }];
}

export function toggleTodo(todos, id) {
  return todos.map((todo) =>
    todo.id === id ? { ...todo, completed: !todo.completed } : todo
  );
}

export function removeTodo(todos, id) {
  return todos.filter((todo) => todo.id !== id);
}

const storageKey = "tailered-demo-todos-v1";

function loadTodos() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function startBrowserApp() {
  const form = document.querySelector("#todo-form");
  const input = document.querySelector("#todo-title");
  const list = document.querySelector("#todo-list");
  const summary = document.querySelector("#summary");
  let todos = loadTodos();

  const commit = (next) => {
    todos = next;
    localStorage.setItem(storageKey, JSON.stringify(todos));
    render();
  };

  const render = () => {
    list.replaceChildren(
      ...todos.map((todo) => {
        const item = document.createElement("li");
        item.dataset.completed = String(todo.completed);
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = todo.completed;
        toggle.setAttribute("aria-label", \`Mark \${todo.title} complete\`);
        toggle.addEventListener("change", () => commit(toggleTodo(todos, todo.id)));
        const title = document.createElement("span");
        title.className = "title";
        title.textContent = todo.title;
        const remove = document.createElement("button");
        remove.className = "remove";
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => commit(removeTodo(todos, todo.id)));
        item.append(toggle, title, remove);
        return item;
      })
    );
    const open = todos.filter((todo) => !todo.completed).length;
    summary.textContent = \`\${open} open\`;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    commit(addTodo(todos, input.value));
    form.reset();
    input.focus();
  });
  render();
}

if (typeof document !== "undefined") startBrowserApp();
`,
    },
    {
      path: "product/test/todo.test.mjs",
      content: `import assert from "node:assert/strict";
import test from "node:test";
import { addTodo, removeTodo, toggleTodo } from "../app.mjs";

test("adds a trimmed todo", () => {
  assert.deepEqual(addTodo([], "  Ship v1  ", "todo-1"), [
    { id: "todo-1", title: "Ship v1", completed: false },
  ]);
});

test("rejects an empty title", () => {
  assert.throws(() => addTodo([], "   ", "todo-1"), /required/);
});

test("toggles only the selected todo", () => {
  const todos = [
    { id: "a", title: "A", completed: false },
    { id: "b", title: "B", completed: false },
  ];
  assert.deepEqual(toggleTodo(todos, "b"), [
    todos[0],
    { id: "b", title: "B", completed: true },
  ]);
});

test("removes only the selected todo", () => {
  const todos = [
    { id: "a", title: "A", completed: false },
    { id: "b", title: "B", completed: false },
  ];
  assert.deepEqual(removeTodo(todos, "a"), [todos[1]]);
});
`,
    },
    {
      path: "product/scripts/verify-preview.mjs",
      content: `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /id="todo-form"/);
assert.match(html, /src="\\.\\/app\\.mjs"/);
assert.doesNotMatch(html, /login|sign[ -]?in|password/i);
`,
    },
    {
      path: "product/README.md",
      content: `# Single-user todo demo

Open \`index.html\` in a browser. Tasks persist in that browser's local storage.

Run \`npm test\` from this directory to verify the todo operations.
`,
    },
  ],
};
