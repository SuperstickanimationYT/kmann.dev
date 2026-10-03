const PROPERTIES = new Set(['value', 'checked', 'textContent', 'hidden', 'disabled', 'selected', 'title', 'placeholder', 'type', 'name', 'min', 'max']);

export function el(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (PROPERTIES.has(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}


export const find = (selector, root = document) => root.querySelector(selector);
