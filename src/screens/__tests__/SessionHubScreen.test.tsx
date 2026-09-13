import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SessionHubScreen, accountLine, selectionFor } from '../SessionHubScreen';
import { fixtureCatalogue } from '../../testing/fixtureCatalogue';
import { fakeAccount } from '../../testing/fakeAccount';

const catalogue = fixtureCatalogue();

function renderHub(budget: number, overrides: Partial<React.ComponentProps<typeof SessionHubScreen>> = {}) {
  const onWatch = jest.fn();
  const onSettings = jest.fn();
  const onCatalogue = jest.fn();
  const loadCatalogue = jest.fn().mockResolvedValue(catalogue);
  render(
    <SessionHubScreen
      accounts={[fakeAccount(budget)]}
      budget={budget}
      catalogue={catalogue}
      loadCatalogue={loadCatalogue}
      onCatalogue={onCatalogue}
      onWatch={onWatch}
      onSettings={onSettings}
      {...overrides}
    />,
  );
  return { onWatch, onSettings, onCatalogue, loadCatalogue };
}

describe('SessionHubScreen', () => {
  it('renders the account line, hero, 20 driver chips and data screens from the fixture', () => {
    const { loadCatalogue, onSettings } = renderHub(1);
    expect(screen.getByTestId('hub-account').props.children).toBe('Test line · 1 connection · expires 2027-07-08');
    expect(screen.getByTestId('hub-watch')).toBeTruthy();
    expect(screen.getAllByText('F1 TV').length).toBeGreaterThan(0);

    const chips = screen.getAllByTestId(/^hub-driver-/);
    expect(chips).toHaveLength(20);
    expect(catalogue.drivers).toHaveLength(20);
    // Championship team order: McLaren first.
    expect(chips[0].props.testID).toBe('hub-driver-NOR');
    expect(chips[1].props.testID).toBe('hub-driver-PIA');
    expect(screen.getByText('Verstappen')).toBeTruthy();

    expect(screen.getAllByTestId(/^hub-world-/).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId(/^hub-data-/).length).toBeGreaterThan(0);
    expect(loadCatalogue).not.toHaveBeenCalled();
    expect(screen.queryByTestId('hub-loading')).toBeNull();

    fireEvent.press(screen.getByTestId('hub-settings'));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('budget 1: a driver chip watches that driver as main', () => {
    const { onWatch } = renderHub(1);
    fireEvent.press(screen.getByTestId('hub-driver-NOR'));
    expect(onWatch).toHaveBeenCalledWith({ main: 'driver:NOR' });
  });

  it('budget 2: a driver chip docks the driver next to the default world feed', () => {
    const { onWatch } = renderHub(2);
    fireEvent.press(screen.getByTestId('hub-driver-NOR'));
    expect(onWatch).toHaveBeenCalledWith({ main: 'world:6862', docked: ['driver:NOR'] });

    fireEvent.press(screen.getByTestId('hub-watch'));
    expect(onWatch).toHaveBeenLastCalledWith({ main: 'world:6862' });

    fireEvent.press(screen.getByTestId('hub-world-1223445'));
    expect(onWatch).toHaveBeenLastCalledWith({ main: 'world:1223445' });

    const dataId = catalogue.data[0].streamId;
    fireEvent.press(screen.getByTestId(`hub-data-${dataId}`));
    expect(onWatch).toHaveBeenLastCalledWith({ main: 'world:6862', docked: [`data:${dataId}`] });
  });

  it('loads the catalogue on mount when none is cached, with loading and error states', async () => {
    const loadCatalogue = jest.fn().mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValueOnce(catalogue);
    const { onCatalogue } = renderHub(1, { catalogue: null, loadCatalogue });
    expect(screen.getByTestId('hub-loading')).toBeTruthy();
    expect(screen.queryByTestId('hub-watch')).toBeNull();

    await waitFor(() => expect(screen.getByTestId('hub-error')).toBeTruthy());
    expect(screen.getByText(/HTTP 503/)).toBeTruthy();
    expect(onCatalogue).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByTestId('hub-retry'));
    });
    await waitFor(() => expect(onCatalogue).toHaveBeenCalledWith(catalogue));
    expect(loadCatalogue).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('hub-error')).toBeNull();
  });

  it('helpers: account line and selection', () => {
    expect(accountLine([fakeAccount(1, { label: 'A' }), fakeAccount(2, { label: 'B' })], 3)).toBe(
      'A + B · 3 connections · expires 2027-07-08',
    );
    expect(accountLine([], 0)).toBe('No line · 0 connections · expires never');
    expect(selectionFor(catalogue, 1, 'driver:VER')).toEqual({ main: 'driver:VER' });
    expect(selectionFor(catalogue, 3, 'driver:VER')).toEqual({ main: 'world:6862', docked: ['driver:VER'] });
    expect(selectionFor({ ...catalogue, defaultWorldFeed: null }, 3, 'driver:VER')).toEqual({ main: 'driver:VER' });
  });
});
