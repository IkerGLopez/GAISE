(function(){
  'use strict';

  const STORAGE_KEY = 'fromscratch-hello-todo:v1';
  const form = document.getElementById('todo-form');
  const input = document.getElementById('new-todo');
  const list = document.getElementById('todo-list');
  const taskCount = document.getElementById('task-count');
  const clearCompletedBtn = document.getElementById('clear-completed');
  const filterButtons = document.querySelectorAll('.filter-btn');

  let todos = [];
  let filter = 'all';

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }

  function load(){
    try{ todos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }catch(e){ todos = []; }
  }

  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function render(){
    const visible = todos.filter(t => {
      if(filter === 'active') return !t.completed;
      if(filter === 'completed') return t.completed;
      return true;
    });

    list.innerHTML = visible.map(todo => `
      <li class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
        <label class="todo-row">
          <input class="checkbox-complete" type="checkbox" ${todo.completed ? 'checked' : ''} aria-label="Mark '${escapeHtml(todo.text)}' as completed">
          <span class="todo-text" tabindex="0">${escapeHtml(todo.text)}</span>
        </label>
        <div class="todo-actions">
          <button class="btn btn-edit" aria-label="Edit">✎</button>
          <button class="btn btn-delete" aria-label="Delete">🗑</button>
        </div>
      </li>
    `).join('');

    const remaining = todos.filter(t => !t.completed).length;
    taskCount.textContent = `${remaining} item${remaining !== 1 ? 's' : ''} left`;
    filterButtons.forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
  }

  function addTodo(text){
    const trimmed = text.trim();
    if(!trimmed) return;
    todos.unshift({ id: uid(), text: trimmed, completed: false, createdAt: Date.now() });
    save(); render();
  }

  function toggleTodo(id){
    const t = todos.find(x => x.id === id); if(!t) return; t.completed = !t.completed; save(); render();
  }

  function deleteTodo(id){ todos = todos.filter(x => x.id !== id); save(); render(); }

  function startEdit(li, id){
    const span = li.querySelector('.todo-text');
    const original = span.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'edit-input'; input.value = original;
    li.classList.add('editing'); span.replaceWith(input); input.focus(); input.setSelectionRange(0, input.value.length);

    function finish(saveEdit){
      li.classList.remove('editing'); input.removeEventListener('keydown', onKey); input.removeEventListener('blur', onBlur);
      if(saveEdit){ const newText = input.value.trim(); if(newText){ const t = todos.find(x => x.id === id); t.text = newText; save(); } else { deleteTodo(id); return; } }
      render();
    }
    function onKey(e){ if(e.key === 'Enter') finish(true); else if(e.key === 'Escape') finish(false); }
    function onBlur(){ finish(true); }
    input.addEventListener('keydown', onKey); input.addEventListener('blur', onBlur);
  }

  form.addEventListener('submit', e => { e.preventDefault(); addTodo(input.value); input.value = ''; input.focus(); });

  list.addEventListener('click', e => {
    const li = e.target.closest('li.todo-item'); if(!li) return; const id = li.dataset.id;
    if(e.target.matches('.checkbox-complete')) toggleTodo(id);
    else if(e.target.matches('.btn-delete')) deleteTodo(id);
    else if(e.target.matches('.btn-edit')) startEdit(li, id);
  });

  list.addEventListener('keydown', e => {
    if(e.target.classList.contains('todo-text') && (e.key === 'Enter' || e.key === ' ')){
      e.preventDefault(); const li = e.target.closest('li.todo-item'); toggleTodo(li.dataset.id);
    }
  });

  filterButtons.forEach(btn => btn.addEventListener('click', () => { filter = btn.dataset.filter; render(); }));
  clearCompletedBtn.addEventListener('click', () => { todos = todos.filter(t => !t.completed); save(); render(); });

  load(); render();
  window.__todoApp = { addTodo, todos };
})();