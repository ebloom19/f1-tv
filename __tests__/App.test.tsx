import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { App } from '../App';
import type { XtreamClientLike } from '../App';
import type { XtreamCredentials } from '../src/provider/xtream/types';
import { FIXTURE_CATEGORIES, FIXTURE_STREAMS } from '../src/testing/fixtureCatalogue';
import { FAKE_CREDS, fakeAccount } from '../src/testing/fakeAccount';

function fakeClientFactory(budget: number, opts: { authFails?: boolean } = {}) {
  const created: XtreamCredentials[] = [];
  const authenticate = jest.fn(async () => {
    if (opts.authFails) {
      throw new Error('AUTH_FAILED');
    }
    return fakeAccount(budget);
  });
  const getLiveStreams = jest.fn(async () => FIXTURE_STREAMS);
  const getLiveCategories = jest.fn(async () => FIXTURE_CATEGORIES);
  const createClient = (creds: XtreamCredentials): XtreamClientLike => {
    created.push(creds);
    return { authenticate, getLiveStreams, getLiveCategories };
  };
  return { createClient, created, authenticate, getLiveStreams, getLiveCategories };
}

describe('App', () => {
  it('shows the Connect screen when no credentials are configured, then goes to the hub after saving', async () => {
    const f = fakeClientFactory(1);
    render(<App configuredCredentials={null} createClient={f.createClient} />);
    await waitFor(() => expect(screen.getByTestId('connect-screen')).toBeTruthy());
    expect(f.authenticate).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('connect-url'), 'panel.test');
    fireEvent.changeText(screen.getByTestId('connect-username'), 'USER');
    fireEvent.changeText(screen.getByTestId('connect-password'), 'PASS');
    await act(async () => {
      fireEvent.press(screen.getByTestId('connect-save'));
    });
    expect(f.created[0]).toMatchObject({ baseUrl: 'http://panel.test', username: 'USER', password: 'PASS' });
    await waitFor(() => expect(screen.getByTestId('connect-use')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('connect-use'));
    });
    await waitFor(() => expect(screen.getByTestId('hub-screen')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('hub-watch')).toBeTruthy());
    expect(f.getLiveStreams).toHaveBeenCalledTimes(1);
    expect(f.getLiveCategories).toHaveBeenCalledTimes(1);
  });

  it('auto-authenticates configured credentials and navigates hub → watch → hub', async () => {
    const f = fakeClientFactory(2);
    render(<App configuredCredentials={FAKE_CREDS} createClient={f.createClient} />);
    expect(screen.getByTestId('boot-screen')).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId('hub-screen')).toBeTruthy());
    expect(f.authenticate).toHaveBeenCalledTimes(1);
    expect(f.created[0]).toEqual(FAKE_CREDS);
    expect(screen.getByTestId('hub-account').props.children).toBe('Test line · 2 connections · expires 2027-07-08');

    await waitFor(() => expect(screen.getAllByTestId(/^hub-driver-/)).toHaveLength(20));
    fireEvent.press(screen.getByTestId('hub-driver-VER'));

    await waitFor(() => expect(screen.getByTestId('watch-screen')).toBeTruthy());
    expect(screen.getByTestId('video-world:7929')).toBeTruthy();
    expect(screen.getByTestId('tile-driver:VER')).toBeTruthy();
    expect(screen.getByTestId('video-driver:VER')).toBeTruthy();

    // Menu closes the rail, Menu again returns to the hub (catalogue is cached, no refetch).
    act(() => {
      globalThis.emitTVEvent({ eventType: 'menu' });
    });
    act(() => {
      globalThis.emitTVEvent({ eventType: 'menu' });
    });
    await waitFor(() => expect(screen.getByTestId('hub-screen')).toBeTruthy());
    expect(screen.queryByTestId('watch-screen')).toBeNull();
    expect(f.getLiveStreams).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('hub-settings'));
    await waitFor(() => expect(screen.getByTestId('connect-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('connect-back'));
    await waitFor(() => expect(screen.getByTestId('hub-screen')).toBeTruthy());
  });

  it('falls back to the Connect screen when automatic sign-in fails', async () => {
    const f = fakeClientFactory(1, { authFails: true });
    render(<App configuredCredentials={FAKE_CREDS} createClient={f.createClient} />);
    await waitFor(() => expect(screen.getByTestId('connect-screen')).toBeTruthy());
    expect(screen.getByTestId('boot-error').props.children).toBe('Automatic sign-in failed: AUTH_FAILED');
    // The form is pre-filled with the configured line.
    expect(screen.getByTestId('connect-url').props.value).toBe(FAKE_CREDS.baseUrl);
  });
});
