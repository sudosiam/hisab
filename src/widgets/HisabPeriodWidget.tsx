'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '../services/widgetSnapshot';
import { DEEP_LINKS, widgetColors } from './widgetTheme';

function Cell({
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
        paddingHorizontal: 10,
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
          fontSize: 15,
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

export function HisabPeriodWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
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
        padding: 10,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: DEEP_LINKS.profitLoss }}
      accessibilityLabel={`Hisab ${snapshot.periodTitle}`}
    >
      <TextWidget
        text={snapshot.periodTitle}
        style={{ fontSize: 11, color: widgetColors.primary, fontWeight: '700', marginBottom: 2 }}
      />
      <TextWidget
        text={snapshot.periodLabel}
        style={{ fontSize: 10, color: widgetColors.textMuted, marginBottom: 6 }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
        <Cell label="Revenue" value={snapshot.labels.sold} />
        <Cell label="Purchases" value={snapshot.labels.purchased} valueColor={widgetColors.warning} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'row' }}>
        <Cell label="Expenses" value={snapshot.labels.expense} valueColor={widgetColors.danger} />
        <Cell
          label="Net profit"
          value={snapshot.labels.netProfit}
          valueColor={netColor}
          uri={DEEP_LINKS.profitLoss}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
