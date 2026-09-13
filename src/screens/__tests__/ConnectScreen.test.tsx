import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ConnectScreen } from '../ConnectScreen';
import { fakeAccount } from '../../testing/fakeAccount';

describe('ConnectScreen', () => {
  it('normalises the server URL and authenticates on "Test & save"', async () => {
    const account = fakeAccount(2);
    const authenticate = jest.fn().mockResolvedValue(account);
    const onSave = jest.fn();
    const onDone = jest.fn();
    render(<ConnectScreen accounts={[]} authenticate={authenticate} onSave={onSave} onDone={onDone} />);

    fireEvent.changeText(screen.getByTestId('connect-url'), '  Panel.Example.com:80/player_api.php ');
    fireEvent.changeText(screen.getByTestId('connect-username'), 'alice ');
    fireEvent.changeText(screen.getByTestId('connect-password'), 's3cret');
    fireEvent.changeText(screen.getByTestId('connect-label'), 'Living room');

    await act(async () => {
      fireEvent.press(screen.getByTestId('connect-save'));
    });

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith({
      baseUrl: 'http://panel.example.com',
      username: 'alice',
      password: 's3cret',
      label: 'Living room',
    });

    await waitFor(() => expect(screen.getByTestId('connect-result')).toBeTruthy());
    expect(screen.getByText(/2 connections · expires 2027-07-08/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('connect-use'));
    expect(onSave).toHaveBeenCalledWith(account);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not submit with empty fields', () => {
    const authenticate = jest.fn();
    render(<ConnectScreen accounts={[]} authenticate={authenticate} onSave={jest.fn()} onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('connect-save'));
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('pre-fills from initial credentials and shows auth errors', async () => {
    const authenticate = jest.fn().mockRejectedValue(new Error('AUTH_FAILED: bad password'));
    render(
      <ConnectScreen
        initial={{ baseUrl: 'http://panel.test', username: 'USER', password: 'PASS' }}
        accounts={[fakeAccount(1)]}
        authenticate={authenticate}
        onSave={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByTestId('connect-url').props.value).toBe('http://panel.test');
    expect(screen.getByTestId('connect-pool')).toBeTruthy();
    expect(screen.getByText(/Test line · 1 connection · expires/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('connect-save'));
    });
    expect(authenticate).toHaveBeenCalledWith({ baseUrl: 'http://panel.test', username: 'USER', password: 'PASS', label: undefined });
    await waitFor(() => expect(screen.getByTestId('connect-error')).toBeTruthy());
    expect(screen.getByText(/bad password/)).toBeTruthy();
  });

  it('"Add another line" saves and clears the form for the next line', async () => {
    const account = fakeAccount(1);
    const authenticate = jest.fn().mockResolvedValue(account);
    const onSave = jest.fn();
    const onDone = jest.fn();
    render(
      <ConnectScreen
        initial={{ baseUrl: 'panel.test', username: 'USER', password: 'PASS' }}
        accounts={[]}
        authenticate={authenticate}
        onSave={onSave}
        onDone={onDone}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('connect-save'));
    });
    await waitFor(() => expect(screen.getByTestId('connect-add')).toBeTruthy());
    fireEvent.press(screen.getByTestId('connect-add'));
    expect(onSave).toHaveBeenCalledWith(account);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('connect-url').props.value).toBe('');
    expect(screen.queryByTestId('connect-result')).toBeNull();
  });
});
