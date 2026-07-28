'use no memo';

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { DEEP_LINKS, widgetColors } from './widgetTheme';

function ActionButton({ label, uri }: { label: string; uri: string }) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        height: 'match_parent',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: widgetColors.button,
        borderRadius: 12,
        marginHorizontal: 4,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
    >
      <TextWidget
        text={label}
        style={{ fontSize: 13, color: widgetColors.buttonText, fontWeight: '700' }}
      />
    </FlexWidget>
  );
}

export function HisabActionsWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: widgetColors.bg,
        borderRadius: 16,
        padding: 8,
      }}
      accessibilityLabel="Hisab quick actions"
    >
      <ActionButton label="New Sale" uri={DEEP_LINKS.salesNew} />
      <ActionButton label="Payment" uri={DEEP_LINKS.paymentsNew} />
    </FlexWidget>
  );
}
