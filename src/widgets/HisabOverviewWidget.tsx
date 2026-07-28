'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '../services/widgetSnapshot';
import { DEEP_LINKS, widgetColors } from './widgetTheme';

function MetricCell({
  label,
  value,
  valueColor,
  uri,
}: {
  label: string;
  value: string;
  valueColor?: (typeof widgetColors)[keyof typeof widgetColors];
  uri?: string;
}) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
      }}
      clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={uri ? { uri } : undefined}
      accessibilityLabel={`${label} ${value}`}
    >
      <TextWidget
        text={label}
        style={{ fontSize: 10, color: widgetColors.textMuted, fontWeight: '500' }}
      />
      <TextWidget
        text={value}
        style={{
          fontSize: 14,
          color: valueColor ?? widgetColors.text,
          fontWeight: '700',
          marginTop: 2,
        }}
        truncate="END"
        maxLines={1}
      />
    </FlexWidget>
  );
}

export function HisabOverviewWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  const netColor =
    snapshot.netProfit >= 0 ? widgetColors.success : widgetColors.danger;

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: widgetColors.bg,
        borderRadius: 16,
        padding: 8,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: DEEP_LINKS.home }}
      accessibilityLabel="Hisab overview"
    >
      <TextWidget
        text="Overview"
        style={{ fontSize: 11, color: widgetColors.primary, fontWeight: '700', marginBottom: 4 }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
        <MetricCell
          label="Net profit"
          value={snapshot.labels.netProfit}
          valueColor={netColor}
          uri={DEEP_LINKS.profitLoss}
        />
        <MetricCell
          label="Cash & bank"
          value={snapshot.labels.totalLiquid}
          uri={DEEP_LINKS.banking}
        />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
        <MetricCell label="Receivable" value={snapshot.labels.receivable} valueColor={widgetColors.danger} />
        <MetricCell label="Payable" value={snapshot.labels.payable} valueColor={widgetColors.warning} />
      </FlexWidget>
    </FlexWidget>
  );
}
