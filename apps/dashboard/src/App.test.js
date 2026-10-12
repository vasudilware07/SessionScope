import { jsx as _jsx } from "react/jsx-runtime";
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
describe('dashboard shell', () => { it('renders product navigation and overview', () => { render(_jsx(QueryClientProvider, { client: new QueryClient(), children: _jsx(MemoryRouter, { children: _jsx(App, {}) }) })); expect(screen.getByText('SessionScope')).toBeTruthy(); expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy(); expect(screen.getByText('API connected')).toBeTruthy(); }); });
