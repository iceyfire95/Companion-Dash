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

function alignItemsFor(valign: Cell['valign']): CSSProperties['alignItems'] {
  return valign === 'top' ? 'flex-start'
       : valign === 'bottom' ? 'flex-end'
       : 'center';
}

function CellView({
  cell, values, isHeader, fillParent, selected, isButton, onClick
}: {
  cell: Cell;
  values: Record<string, string>;
  isHeader: boolean;
  fillParent?: boolean;
  selected?: boolean;
  isButton?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const style = applyRules(cell, values);
  const valign: Cell['valign'] = cell.valign ?? 'middle';

  const resolved = useMemo(() => resolveText(cell.text, values), [cell.text, values]);
  const html = useMemo(() => renderMarkdown(resolved), [resolved]);

  const { outerRef, innerRef } = useAutoFit(cell.fontSize, [html, cell.fontSize]);

  // Wrapper fills its grid/flex parent. It's a flex container that vertically
  // aligns the inner element. The inner element fills the wrapper's width, so
  // text-align does the horizontal alignment (this matters when marked wraps
  // content in a <p>, which is a block element).
  const wrapperStyle: CSSProperties = {
    background: style.bgColor,
    color: style.textColor,
    borderColor: style.borderColor,
    borderWidth: cell.borderWidth,
    borderStyle: cell.borderWidth > 0 ? 'solid' : 'none',
    fontWeight: style.fontWeight,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: alignItemsFor(valign), // vertical via main-axis
    alignItems: 'stretch',                 // inner fills horizontally
    padding: 4,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
    position: 'relative',
    // Selection visual - inset outline that doesn't change layout
    ...(selected ? { outline: '2px solid #f59e0b', outlineOffset: '-2px' } : {}),
    // Button cursor + active feedback
    ...(isButton ? { cursor: 'pointer', userSelect: 'none' as const } : {}),
    ...(fillParent ? { flex: 1, alignSelf: 'stretch' } : {}),
    gridRow: isHeader ? undefined : `${cell.row + 1} / span ${cell.rowSpan}`,
    gridColumn: isHeader ? undefined : `${cell.col + 1} / span ${cell.colSpan}`
  };

  const innerStyle: CSSProperties = {
    textAlign: cell.align,
    fontSize: cell.fontSize,
    // Inner is full-width so text-align has effect. height:auto so
    // align-items 'stretch' on parent doesn't stretch this vertically;
    // we use flex-direction:column + justify-content for vertical positioning.
    width: '100%'
  };

  return (
    <div
      ref={outerRef}
      className={`cell${isButton ? ' cell-button' : ''}`}
      style={wrapperStyle}
      onClick={onClick}
    >
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
  /** Cell id to highlight as selected. Use 'header' for the header cell. */
  selectedCellId?: string | null;
  /** Height (px) of the header strip when headerEnabled. Defaults to 25% of panel height. */
  headerHeightRatio?: number;
  onMouseDownPanel?: (e: React.MouseEvent) => void;
  onMouseDownResize?: (e: React.MouseEvent, kind: 'br' | 'r' | 'b') => void;
  /**
   * Viewer-only: invoked when a clickable cell (with button.enabled) is
   * pressed. cellId is either a real cell id or 'header'.
   */
  onCellButtonPress?: (cellId: string) => void;
  /**
   * Viewer-only: invoked when the panel itself (with panel.button.enabled)
   * is pressed in an area not handled by a cell button.
   */
  onPanelButtonPress?: () => void;
}

export function PanelView({
  panel, values, selected, editing, selectedCellId, headerHeightRatio = 0.25,
  onMouseDownPanel, onMouseDownResize, onCellButtonPress, onPanelButtonPress
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
      onMouseDown={onMouseDownPanel}
      onClick={onPanelButtonPress && panel.button?.enabled
        ? (e) => {
            // Only fire if click wasn't already consumed by a cell button.
            if ((e.target as HTMLElement).closest('.cell-button')) return;
            onPanelButtonPress();
          }
        : undefined}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.zIndex,
        background: panel.bgColor,
        border: `${panel.borderWidth}px solid ${panel.borderColor}`,
        borderRadius: panel.borderRadius,
        ...(onPanelButtonPress && panel.button?.enabled ? { cursor: 'pointer' } : {})
      }}
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
          <CellView
            cell={panel.header}
            values={values}
            isHeader
            fillParent
            selected={selectedCellId === 'header'}
            isButton={!!(onCellButtonPress && panel.header.button?.enabled)}
            onClick={onCellButtonPress && panel.header.button?.enabled
              ? (e) => { e.stopPropagation(); onCellButtonPress('header'); }
              : undefined}
          />
        </div>
      )}
      <div className="panel-body" style={gridTemplate}>
        {panel.cells.map(c => (
          <CellView
            key={c.id}
            cell={c}
            values={values}
            isHeader={false}
            selected={selectedCellId === c.id}
            isButton={!!(onCellButtonPress && c.button?.enabled)}
            onClick={onCellButtonPress && c.button?.enabled
              ? (e) => { e.stopPropagation(); onCellButtonPress(c.id); }
              : undefined}
          />
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
