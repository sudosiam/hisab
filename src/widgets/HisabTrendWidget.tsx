'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '../services/widgetSnapshot';
import { DEEP_LINKS, widgetColors } from './widgetTheme';

const MAX_BARS = 14;

export function HisabTrendWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  const days = snapshot.trendDays;
  const activeDays = days.filter((d) => d.sales > 0 || d.netProfit !== 0);
  const sample =
    days.length <= MAX_BARS
      ? days
      : days.filter((_, i) => i % Math.ceil(days.length / MAX_BARS) === 0).slice(0, MAX_BARS);

  const maxSales = Math.max(1, ...sample.map((d) => d.sales));

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
      clickActionData={{ uri: DEEP_LINKS.home }}
      accessibilityLabel="Hisab daily trend"
    >
      <FlexWidget
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <TextWidget
          text="Daily trend"
          style={{ fontSize: 11, color: widgetColors.primary, fontWeight: '700' }}
        />
        <TextWidget
          text={snapshot.periodLabel}
          style={{ fontSize: 10, color: widgetColors.textMuted }}
        />
      </FlexWidget>

      {!snapshot.trendAvailable || sample.length === 0 ? (
        <FlexWidget
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget
            text={
              !snapshot.trendAvailable
                ? 'Open Hisab and pick a month'
                : 'No activity this month'
            }
            style={{ fontSize: 12, color: widgetColors.textMuted }}
          />
        </FlexWidget>
      ) : (
        <>
          <FlexWidget
            style={{
              height: 96,
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              paddingHorizontal: 2,
            }}
          >
            {sample.map((d) => {
              const barHeight = Math.max(6, Math.round((d.sales / maxSales) * 96));
              const barColor =
                d.netProfit >= 0 ? widgetColors.bar : widgetColors.danger;
              return (
                <FlexWidget
                  key={d.shortLabel}
                  style={{
                    flex: 1,
                    height: barHeight,
                    marginHorizontal: 1,
                    backgroundColor: barColor,
                    borderRadius: 3,
                  }}
                />
              );
            })}
          </FlexWidget>
          <FlexWidget
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 6,
            }}
          >
            <TextWidget
              text={`Sales days ${activeDays.length}`}
              style={{ fontSize: 10, color: widgetColors.textMuted }}
            />
            <TextWidget
              text={`Net ${snapshot.labels.netProfit}`}
              style={{
                fontSize: 11,
                color:
                  snapshot.netProfit >= 0 ? widgetColors.success : widgetColors.danger,
                fontWeight: '700',
              }}
            />
          </FlexWidget>
        </>
      )}
    </FlexWidget>
  );
}
