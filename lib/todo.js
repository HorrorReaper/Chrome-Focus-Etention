export function updateTodoList(state, updateState) {
  if (!state) {
    console.warn('updateTodoList called without state');
    return;
  }
  const todoList = document.getElementById("todoList");
  if (!todoList) {
    console.warn('updateTodoList: #todoList element not found');
    return;
  }
  todoList.innerHTML = "";
  const listTodos = (state.todos && state.todos[state.activeList]) || [];
  listTodos.forEach((todo, index) => {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.onchange = () => {
      chrome.runtime.sendMessage(
        { type: "updateTodo", action: "toggle", index },
        () => updateState()
      );
    };

    const textSpan = document.createElement("span");
    textSpan.className = "todo-text";
    textSpan.textContent = todo.text;
    if (todo.done) textSpan.classList.add("done");

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "×";
    deleteBtn.onclick = () => {
      chrome.runtime.sendMessage(
        { type: "updateTodo", action: "delete", index },
        () => updateState()
      );
    };

    li.append(checkbox, textSpan, deleteBtn);
    todoList.appendChild(li);
  });
}
export function addToDo(updateState){
    const input = document.getElementById("newTodoInput");
    const text = input.value.trim();
    if (!text) return;
    chrome.runtime.sendMessage(
      { type: "updateTodo", action: "add", value: text },
      () => {
        input.value = "";
        updateState();
      }
    );
}