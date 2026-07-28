'use no memo';

import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadWidgetSnapshot } from '../services/widgetSnapshot';
import { renderWidgetByName } from './renderWidget';

/**
 * Android home-widget task handler.
 * Must stay free of React hooks; may use async I/O.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction } = props;

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const snapshot = await loadWidgetSnapshot();
      props.renderWidget(renderWidgetByName(widgetInfo.widgetName, snapshot));
      break;
    }
    case 'WIDGET_CLICK':
      // OPEN_APP / OPEN_URI are handled natively; custom clicks redraw.
      props.renderWidget(
        renderWidgetByName(widgetInfo.widgetName, await loadWidgetSnapshot())
      );
      break;
    case 'WIDGET_DELETED':
      break;
    default:
      break;
  }
}
