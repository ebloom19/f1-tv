import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { DriverChip } from '../DriverChip';
import { EmptySlot, lockedSlotText } from '../EmptySlot';
import { FocusButton } from '../FocusButton';
import { OnboardTile } from '../OnboardTile';
import { Rail } from '../Rail';
import { Toast } from '../Toast';
import { focus } from '../theme';

const rect = { x: 10, y: 20, w: 480, h: 270 };

function flat(el: { props: Record<string, unknown> }): Record<string, unknown> {
  return StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;
}

describe('ui components', () => {
  it('FocusButton scales and gains a white border on focus, passes hasTVPreferredFocus', () => {
    const onPress = jest.fn();
    render(<FocusButton title="Watch" onPress={onPress} hasTVPreferredFocus testID="btn" />);
    const btn = screen.getByTestId('btn');
    expect(btn.props.hasTVPreferredFocus).toBe(true);
    expect(flat(btn).borderColor).toBe('transparent');
    fireEvent(btn, 'focus');
    expect(flat(btn).borderColor).toBe(focus.borderColor);
    expect(flat(btn).transform).toEqual([{ scale: focus.scale }]);
    fireEvent(btn, 'blur');
    expect(flat(btn).borderColor).toBe('transparent');
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('DriverChip shows abbr in weight 900, last name, team colour bar and state badges', () => {
    const onLongPress = jest.fn();
    render(<DriverChip abbr="VER" name="Verstappen" color="#3671C6" state="docked" onLongPress={onLongPress} testID="chip" />);
    const abbr = screen.getByText('VER');
    expect(StyleSheet.flatten(abbr.props.style).fontWeight).toBe('900');
    expect(screen.getByText('Verstappen')).toBeTruthy();
    expect(screen.getByText('ON')).toBeTruthy();
    const chip = screen.getByTestId('chip');
    fireEvent(chip, 'focus');
    expect(flat(chip).transform).toEqual([{ scale: focus.scale }]);
    fireEvent(chip, 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);

    screen.rerender(<DriverChip abbr="VER" name="Verstappen" color="#3671C6" state="main" testID="chip" />);
    expect(screen.getByText('MAIN')).toBeTruthy();
  });

  it('OnboardTile positions itself at the rect, shows the header and AUDIO badge', () => {
    render(
      <OnboardTile rect={rect} abbr="VER" color="#3671C6" isAudio testID="tile-driver:VER">
        <></>
      </OnboardTile>,
    );
    const tile = screen.getByTestId('tile-driver:VER');
    expect(flat(tile)).toMatchObject({ left: 10, top: 20, width: 480, height: 270 });
    expect(screen.getByText('VER')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByTestId('tile-driver:VER-audio')).toBeTruthy();
    fireEvent(tile, 'focus');
    expect(flat(tile).borderColor).toBe(focus.borderColor);
  });

  it('EmptySlot renders "Add a driver" or the locked explanation', () => {
    const onPress = jest.fn();
    render(<EmptySlot rect={rect} index={0} locked={false} budget={3} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('empty-slot-0'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('Add a driver')).toBeTruthy();

    screen.rerender(<EmptySlot rect={rect} index={1} locked budget={2} />);
    expect(screen.getByText('Needs connection 3 · your line allows 2')).toBeTruthy();
    expect(lockedSlotText(0, 1)).toBe('Needs connection 2 · your line allows 1');
  });

  it('Rail renders title, hint and children', () => {
    render(
      <Rail rect={rect} title="PITWALL" hint="1 connection · Select switches the feed">
        <DriverChip abbr="NOR" name="Norris" color="#FF8000" testID="chip-driver:NOR" />
      </Rail>,
    );
    expect(screen.getByTestId('rail')).toBeTruthy();
    expect(screen.getByText('PITWALL')).toBeTruthy();
    expect(screen.getByText('1 connection · Select switches the feed')).toBeTruthy();
    expect(screen.getByTestId('chip-driver:NOR')).toBeTruthy();
  });

  it('Toast renders only with a message', () => {
    render(
      <View>
        <Toast message={null} />
      </View>,
    );
    expect(screen.queryByTestId('toast')).toBeNull();
    screen.rerender(
      <View>
        <Toast message="Long-press to replace" />
      </View>,
    );
    expect(screen.getByTestId('toast')).toBeTruthy();
    expect(screen.getByText('Long-press to replace')).toBeTruthy();
  });
});
