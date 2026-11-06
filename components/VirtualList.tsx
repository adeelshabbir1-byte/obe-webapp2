"use client";
import { memo, useState } from "react";

// A long list inside a scroll box, drawing only the rows in view (plus a few either side): a batch of 500 students
// costs the same as 20. Rows have a fixed height.
function VirtualListInner<T>({ items, rowHeight, height, render, getKey, overscan = 6 }: { items: T[]; rowHeight: number; height: number; render: (item: T, index: number) => React.ReactNode; getKey: (item: T) => string; overscan?: number }) {
  const [top, setTop] = useState(0);
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const last = Math.min(items.length, Math.ceil((top + height) / rowHeight) + overscan);
  return (
    <div style={{ maxHeight: height, overflowY: "auto", position: "relative" }} onScroll={(e) => setTop((e.target as HTMLDivElement).scrollTop)} data-virtual-list>
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {items.slice(first, last).map((it, k) => (
          <div key={getKey(it)} style={{ position: "absolute", top: (first + k) * rowHeight, left: 0, right: 0, height: rowHeight, overflow: "hidden" }}>{render(it, first + k)}</div>
        ))}
      </div>
    </div>
  );
}
const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;
export default VirtualList;
