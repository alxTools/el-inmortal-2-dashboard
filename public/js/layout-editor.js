(function () {
    function onReady(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
            return;
        }
        callback();
    }

    function safeReadStorage(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function safeWriteStorage(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (_) {
            // ignore storage failures
        }
    }

    function safeRemoveStorage(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (_) {
            // ignore storage failures
        }
    }

    function safeParseJson(rawValue, fallback) {
        if (!rawValue) return fallback;
        try {
            return JSON.parse(rawValue);
        } catch (_) {
            return fallback;
        }
    }

    onReady(function initLayoutEditor() {
        const body = document.body;
        if (!body || !body.classList.contains('dashboard-view')) {
            return;
        }

        const containers = Array.from(document.querySelectorAll('[data-layout-container]'));
        if (!containers.length) {
            return;
        }

        const pagePath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
        const storagePrefix = `ei2-layout:v1:${pagePath}`;

        let editModeEnabled = false;
        let draggedItem = null;
        const defaultOrders = new Map();

        function getItems(container) {
            return Array.from(container.children).filter((child) => child.hasAttribute('data-layout-item'));
        }

        function getContainerStorageKey(container) {
            return `${storagePrefix}:${container.dataset.layoutContainer}`;
        }

        function persistContainerOrder(container) {
            const key = getContainerStorageKey(container);
            const order = getItems(container).map((item) => item.dataset.layoutItem).filter(Boolean);
            safeWriteStorage(key, JSON.stringify(order));
        }

        function applySavedOrder(container) {
            const key = getContainerStorageKey(container);
            const savedOrder = safeParseJson(safeReadStorage(key), []);
            if (!Array.isArray(savedOrder) || !savedOrder.length) {
                return;
            }

            const items = getItems(container);
            const itemMap = new Map(items.map((item) => [item.dataset.layoutItem, item]));

            savedOrder.forEach((itemId) => {
                const item = itemMap.get(itemId);
                if (item) {
                    container.appendChild(item);
                }
            });
        }

        function setItemControls(item) {
            if (item.dataset.layoutInit === '1') {
                return;
            }

            item.dataset.layoutInit = '1';

            item.classList.add('layout-item-box');

            item.addEventListener('dragstart', function (event) {
                if (!editModeEnabled) {
                    event.preventDefault();
                    return;
                }

                draggedItem = item;
                item.classList.add('layout-item-dragging');

                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.dataset.layoutItem || 'layout-item');
                }
            });

            item.addEventListener('dragend', function () {
                item.classList.remove('layout-item-dragging');
                draggedItem = null;
            });
        }

        function decorateContainer(container) {
            container.classList.add('layout-editable-container');
            getItems(container).forEach((item) => {
                setItemControls(item);
            });

            container.addEventListener('dragover', function (event) {
                if (!editModeEnabled || !draggedItem) return;
                event.preventDefault();

                const targetItem = event.target.closest('[data-layout-item]');
                if (!targetItem || targetItem === draggedItem || targetItem.parentElement !== container) {
                    container.appendChild(draggedItem);
                    return;
                }

                const rect = targetItem.getBoundingClientRect();
                const shouldInsertBefore = event.clientY < rect.top + (rect.height / 2);

                if (shouldInsertBefore) {
                    container.insertBefore(draggedItem, targetItem);
                } else {
                    container.insertBefore(draggedItem, targetItem.nextElementSibling);
                }
            });

            container.addEventListener('drop', function (event) {
                if (!editModeEnabled || !draggedItem) return;
                event.preventDefault();
                persistContainerOrder(container);
            });
        }

        function updateEditModeState() {
            body.classList.toggle('layout-edit-mode', editModeEnabled);
            containers.forEach((container) => {
                getItems(container).forEach((item) => {
                    item.draggable = editModeEnabled;
                });
            });
        }

        function resetAllLayout() {
            containers.forEach((container) => {
                const key = getContainerStorageKey(container);
                const defaults = defaultOrders.get(container) || [];
                const currentMap = new Map(getItems(container).map((item) => [item.dataset.layoutItem, item]));

                defaults.forEach((itemId) => {
                    const item = currentMap.get(itemId);
                    if (item) {
                        container.appendChild(item);
                    }
                });

                safeRemoveStorage(key);
            });
        }

        function createToolbar() {
            if (document.getElementById('layoutEditToolbar')) {
                return;
            }

            const toolbar = document.createElement('div');
            toolbar.id = 'layoutEditToolbar';
            toolbar.className = 'layout-editor-toolbar';

            const toggleButton = document.createElement('button');
            toggleButton.type = 'button';
            toggleButton.className = 'layout-editor-toggle-btn';
            toggleButton.textContent = '🧩 Mover Boxes';

            const resetButton = document.createElement('button');
            resetButton.type = 'button';
            resetButton.className = 'layout-editor-reset-btn';
            resetButton.textContent = '↺ Reset';

            function refreshToolbar() {
                toggleButton.setAttribute('aria-pressed', editModeEnabled ? 'true' : 'false');
                toggleButton.textContent = editModeEnabled ? '✅ Editando Boxes' : '🧩 Mover Boxes';
                resetButton.style.display = editModeEnabled ? 'inline-flex' : 'none';
            }

            toggleButton.addEventListener('click', function () {
                editModeEnabled = !editModeEnabled;
                updateEditModeState();
                refreshToolbar();
            });

            resetButton.addEventListener('click', function () {
                resetAllLayout();
            });

            toolbar.appendChild(toggleButton);
            toolbar.appendChild(resetButton);
            document.body.appendChild(toolbar);

            refreshToolbar();
        }

        containers.forEach((container) => {
            defaultOrders.set(container, getItems(container).map((item) => item.dataset.layoutItem));
            applySavedOrder(container);
            decorateContainer(container);
        });

        createToolbar();
        updateEditModeState();
    });
})();
