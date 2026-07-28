'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetName, WidgetSnapshot } from '../services/widgetSnapshot';
import { HisabActionsWidget } from './HisabActionsWidget';
import { HisabOverviewWidget } from './HisabOverviewWidget';
import { HisabPeriodWidget } from './HisabPeriodWidget';
import { HisabTrendWidget } from './HisabTrendWidget';
import { widgetColors } from './widgetTheme';

export function EmptySyncWidget({ message }: { message?: string }) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: widgetColors.bg,
        borderRadius: 16,
        padding: 12,
      }}
      clickAction="OPEN_APP"
      accessibilityLabel="Open Hisab to sync widget"
    >
      <TextWidget
        text={message ?? 'Open Hisab to sync'}
        style={{ fontSize: 13, color: widgetColors.textMuted, fontWeight: '600' }}
      />
    </FlexWidget>
  );
}

export function renderWidgetByName(name: WidgetName | string, snapshot: WidgetSnapshot | null) {
  if (!snapshot) {
    return <EmptySyncWidget />;
  }

  switch (name) {
    case 'HisabOverview':
      return <HisabOverviewWidget snapshot={snapshot} />;
    case 'HisabPeriod':
      return <HisabPeriodWidget snapshot={snapshot} />;
    case 'HisabTrend':
      return <HisabTrendWidget snapshot={snapshot} />;
    case 'HisabActions':
      return <HisabActionsWidget />;
    default:
      return <EmptySyncWidget message="Unknown widget" />;
  }
}
