import { CSSProperties, useMemo } from 'react';
import { marked } from 'marked';
import type { Cell, Panel } from '../types';
import { resolveText, applyRules } from '../lib/variables';
import { useAutoFit } from '../lib/useAutoFit';

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(s: string): string {
  try { return marked.parse(s, { async: false }) as string; }
  catch { return s; }
}

function justifyFor(align: Cell['align']): CSSProperties['justifyContent'] {
  return align === 'left' ? 'flex-start'
       : align === 'right' ? 'flex-end'
       : 'center';
}

function alignItemsFor(valign: Cell['valign']): CSSProperties['alignItems'] {
  return valign === 'top' ? 'flex-start'
       : valign === 'bottom' ? 'flex-end'
       : 'center';
}

function CellView({
  cell, values, isHeader, fillParent
}: {
  cell: Cell;
  values: Record<string, string>;
  isHeader: boolean;
  fillParent?: boolean;
}) {
  const style = applyRules(cell, values);
  const valign: Cell['valign'] = cell.valign ?? 'middle';

  const resolved = useMemo(() => resolveText(cell.text, values), [cell.text, values]);
  const html = useMemo(() => renderMarkdown(resolved), [resolved]);

  const { outerRef, innerRef } = useAutoFit(cell.fontSize, [html, cell.fontSize]);

  // Wrapper fills its grid/flex parent. Alignment is done on this wrapper
  // (flex container). Inner is a block, sized to content, centered by flex.
  const wrapperStyle: CSSProperties = {
    background: style.bgColor,
    color: style.textColor,
    borderColor: style.borderColor,
    borderWidth: cell.borderWidth,
    borderStyle: cell.borderWidth > 0 ? 'solid' : 'none',
    fontWeight: style.fontWeight,
    display: 'flex',
    justifyContent: justifyFor(cell.align),
    alignItems: alignItemsFor(valign),
    padding: 4,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
    ...(fillParent ? { flex: 1, alignSelf: 'stretch' } : {}),
    gridRow: isHeader ? undefined : `${cell.row + 1} / span ${cell.rowSpan}`,
    gridColumn: isHeader ? undefined : `${cell.col + 1} / span ${cell.colSpan}`
  };

  const innerStyle: CSSProperties = {
    textAlign: cell.align,
    fontSize: cell.fontSize,
    maxWidth: '100%',
    // Inner is a sized-to-content block. Flex parent positions it.
    display: 'block'
  };

  return (
    <div ref={outerRef} className="cell" style={wrapperStyle}>
      <div
        ref={innerRef}
        className="cell-inner"
        style={innerStyle}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export interface PanelViewProps {
  panel: Panel;
  values: Record<string, string>;
  selected?: boolean;
  editing?: boolean;
  /** Height (px) of the header strip when headerEnabled. Defaults to 25% of panel height. */
  headerHeightRatio?: number;
  onMouseDownPanel?: (e: React.MouseEvent) => void;
  onMouseDownResize?: (e: React.MouseEvent, kind: 'br' | 'r' | 'b') => void;
}

export function PanelView({
  panel, values, selected, editing, headerHeightRatio = 0.25,
  onMouseDownPanel, onMouseDownResize
}: PanelViewProps) {
  const gridTemplate: CSSProperties = {
    gridTemplateRows: `repeat(${panel.rows}, 1fr)`,
    gridTemplateColumns: `repeat(${panel.cols}, 1fr)`,
    gap: panel.gap,
    padding: panel.padding,
    paddingTop: panel.headerEnabled ? panel.gap : panel.padding
  };

  return (
    <div
      className={`panel-box ${editing ? 'editing' : ''} ${selected ? 'selected' : ''}`}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.zIndex,
        background: panel.bgColor,
        border: `${panel.borderWidth}px solid ${panel.borderColor}`,
        borderRadius: panel.borderRadius
      }}
      onMouseDown={onMouseDownPanel}
    >
      {panel.headerEnabled && panel.header && (
        <div
          style={{
            // Full width header strip, sized as a fraction of the panel height.
            flex: `0 0 ${Math.max(28, panel.height * headerHeightRatio)}px`,
            padding: panel.padding,
            paddingBottom: 0,
            display: 'flex',
            minHeight: 0
          }}
        >
          <CellView cell={panel.header} values={values} isHeader fillParent />
        </div>
      )}
      <div className="panel-body" style={gridTemplate}>
        {panel.cells.map(c => (
          <CellView key={c.id} cell={c} values={values} isHeader={false} />
        ))}
      </div>
      {onMouseDownResize && (
        <>
          <div className="resize-handle r" onMouseDown={e => onMouseDownResize(e, 'r')} />
          <div className="resize-handle b" onMouseDown={e => onMouseDownResize(e, 'b')} />
          <div className="resize-handle br" onMouseDown={e => onMouseDownResize(e, 'br')} />
        </>
      )}
    </div>
  );
}