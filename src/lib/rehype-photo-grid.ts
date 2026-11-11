/**
 * Rehype plugin: merges consecutive photo-only paragraphs in a chat message
 * into one <div class="photo-grid" data-count="N">, so photos lay out as a
 * tidy grid (1 = single, 2 = pair, 3 = mosaic, 4 = 2×2, 5+ = 3 columns)
 * instead of loose inline cards.
 */

interface HNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
}

const isBlank = (n: HNode) => n.type === "text" && !(n.value ?? "").trim();

/** Returns the <img> nodes if this node is a paragraph containing only images. */
function photoOnly(node: HNode): HNode[] | null {
  if (node.type !== "element" || node.tagName !== "p" || !node.children?.length) return null;
  const imgs: HNode[] = [];
  for (const c of node.children) {
    if (c.type === "element" && c.tagName === "img") imgs.push(c);
    else if (!(isBlank(c) || (c.type === "element" && c.tagName === "br"))) return null;
  }
  return imgs.length ? imgs : null;
}

export function rehypePhotoGrid() {
  return (tree: HNode) => {
    const children = tree.children ?? [];
    const out: HNode[] = [];
    let grid: HNode | null = null;

    for (const child of children) {
      const imgs = photoOnly(child);
      if (imgs) {
        if (!grid) {
          grid = { type: "element", tagName: "div", properties: { className: ["photo-grid"] }, children: [] };
          out.push(grid);
        }
        grid.children!.push(...imgs);
        continue;
      }
      if (grid && isBlank(child)) continue; // whitespace between photo paragraphs
      grid = null;
      out.push(child);
    }

    for (const node of out) {
      if (node.type === "element" && node.tagName === "div" && node.children) {
        const cls = node.properties?.className;
        if (Array.isArray(cls) && cls.includes("photo-grid")) {
          node.properties!["dataCount"] = String(Math.min(node.children.length, 5));
        }
      }
    }
    tree.children = out;
  };
}
