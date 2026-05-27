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
  /**
   * Editor-only: when true, the panel's focus rule is currently evaluating
   * true. The editor shows a green outline so the user can verify their rule
   * fires without switching to viewer.
   */
  focusActive?: boolean;
  /**
   * Editor-only: invoked on mousedown over a row- or column-gutter
   * handle. The editor computes new sizes from the mouse delta and
   * the panel's measured body rect. axis is 'row' or 'col';
   * trackIndex is the 0-based index of the track before the dragged
   * gutter (so a value of 0 means "between track 0 and track 1").
   */
  onMouseDownTrack?: (
    e: React.MouseEvent, axis: 'row' | 'col', trackIndex: number
  ) => void;
}

export function PanelView({
  panel, values, selected, editing, selectedCellId, headerHeightRatio = 0.25,
  onMouseDownPanel, onMouseDownResize, onCellButtonPress, onPanelButtonPress,
  focusActive, onMouseDownTrack
}: PanelViewProps) {
  // Build grid-template strings from per-track sizes when present,
  // otherwise fall back to uniform 1fr per row/column. We clamp each
  // fraction to a minimum of 0.05 so a dragged-flat track is still
  // selectable and recoverable. Arrays with a wrong length (e.g. user
  // changed rows after sizes were saved) are ignored.
  function trackTemplate(count: number, sizes: number[] | undefined): string {
    if (!sizes || sizes.length !== count) return `repeat(${count}, 1fr)`;
    return sizes.map(s => `${Math.max(0.05, Number.isFinite(s) ? s : 1)}fr`).join(' ');
  }
  const gridTemplate: CSSProperties = {
    gridTemplateRows: trackTemplate(panel.rows, panel.rowSizes),
    gridTemplateColumns: trackTemplate(panel.cols, panel.colSizes),
    gap: panel.gap,
    padding: panel.padding,
    paddingTop: panel.headerEnabled ? panel.gap : panel.padding
  };

  return (
    <div
      className={`panel-box ${editing ? 'editing' : ''} ${selected ? 'selected' : ''} ${focusActive ? 'panel-focus-active' : ''}`}
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
      {focusActive && <div className="focus-badge">FOCUS</div>}
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
      <div className="panel-body" style={{ ...gridTemplate, position: 'relative' }}>
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
        {onMouseDownTrack && editing && (
          <TrackHandles
            rows={panel.rows}
            cols={panel.cols}
            rowSizes={panel.rowSizes}
            colSizes={panel.colSizes}
            onMouseDownTrack={onMouseDownTrack}
          />
        )}
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

/**
 * Renders thin invisible (hover-visible) handles between rows and
 * between columns inside `.panel-body`. Positions are computed from
 * the panel's rowSizes/colSizes (or implicit uniform 1fr when those
 * are absent) as percentages of the body's inner area, which means
 * they ride along with the actual grid lines without us needing to
 * measure pixel positions.
 *
 * One handle per gap, so `rows` produces `rows - 1` row handles and
 * same for cols. The handles span the full perpendicular axis.
 *
 * NOTE: cells inside the grid get gridRow/gridColumn from spans, so
 * if a cell spans across a gutter the handle visually overlaps it.
 * That's fine - the gutter is still on the grid line and drag still
 * works. The cell just keeps painting.
 */
function TrackHandles({
  rows, cols, rowSizes, colSizes, onMouseDownTrack
}: {
  rows: number;
  cols: number;
  rowSizes?: number[];
  colSizes?: number[];
  onMouseDownTrack: (
    e: React.MouseEvent, axis: 'row' | 'col', trackIndex: number
  ) => void;
}) {
  // Build cumulative percentage offsets for handle placement.
  // Effective sizes mirror what PanelView feeds grid-template.
  const effRowSizes = (rowSizes && rowSizes.length === rows)
    ? rowSizes.map(s => Math.max(0.05, Number.isFinite(s) ? s : 1))
    : Array(rows).fill(1);
  const effColSizes = (colSizes && colSizes.length === cols)
    ? colSizes.map(s => Math.max(0.05, Number.isFinite(s) ? s : 1))
    : Array(cols).fill(1);

  const rowTotal = effRowSizes.reduce((a, b) => a + b, 0) || 1;
  const colTotal = effColSizes.reduce((a, b) => a + b, 0) || 1;

  // Cumulative offsets (% of body inner area). Last value omitted: a
  // handle on the trailing edge doesn't separate two tracks.
  const rowOffsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < rows - 1; i++) {
    acc += effRowSizes[i];
    rowOffsets.push((acc / rowTotal) * 100);
  }
  const colOffsets: number[] = [];
  acc = 0;
  for (let i = 0; i < cols - 1; i++) {
    acc += effColSizes[i];
    colOffsets.push((acc / colTotal) * 100);
  }

  const handleSize = 8; // px, centred over the gridline

  return (
    <>
      {rowOffsets.map((pct, i) => (
        <div
          key={`rh-${i}`}
          className="track-handle row"
          style={{
            position: 'absolute',
            left: 0, right: 0,
            top: `calc(${pct}% - ${handleSize / 2}px)`,
            height: handleSize,
            cursor: 'row-resize',
            zIndex: 5
          }}
          onMouseDown={e => onMouseDownTrack(e, 'row', i)}
        />
      ))}
      {colOffsets.map((pct, i) => (
        <div
          key={`ch-${i}`}
          className="track-handle col"
          style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: `calc(${pct}% - ${handleSize / 2}px)`,
            width: handleSize,
            cursor: 'col-resize',
            zIndex: 5
          }}
          onMouseDown={e => onMouseDownTrack(e, 'col', i)}
        />
      ))}
    </>
  );
}
