import { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

/**
 * The Angular basics most component specs need (HttpClient backed by the testing controller,
 * and a router so ActivatedRoute/RouterLink resolve). Each spec lists these explicitly so it
 * passes on its own — in a focused run, in any order, without relying on another spec file.
 * Put them first; the spec's own focused spies/mocks listed after them take precedence.
 * Shared by the web and Android clients — keep the two copies identical.
 */
export function baselineTestProviders(): (Provider | EnvironmentProviders)[] {
  return [provideHttpClient(), provideHttpClientTesting(), provideRouter([])];
}
