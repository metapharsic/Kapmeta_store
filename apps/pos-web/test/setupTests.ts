import '@testing-library/jest-dom';
import { vi } from 'vitest';

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    query: {},
    pathname: '/',
    asPath: '/',
  }),
}));

