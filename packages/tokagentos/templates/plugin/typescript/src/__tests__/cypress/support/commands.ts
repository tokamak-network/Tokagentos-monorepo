// @ts-nocheck
/// <reference types="cypress" />
/// <reference types="@cypress/react" />

// ***********************************************
// This file is where you can create custom Cypress commands
// and overwrite existing commands.
//
// For comprehensive examples, visit:
// https://on.cypress.io/custom-commands
// ***********************************************

// Example custom command
// Cypress.Commands.add('login', (email, password) => { ... })

// Custom command to check if element is in dark mode
Cypress.Commands.add("shouldBeDarkMode", () => {
  cy.get("html").should("have.class", "dark");
});

// Custom command to set TOKAGENT_CONFIG
Cypress.Commands.add("setTokagentConfig", (config) => {
  cy.window().then((win) => {
    // Extend Window interface for test configuration
    interface WindowWithTokagentConfig extends Window {
      TOKAGENT_CONFIG?: { agentId: string; apiBase?: string };
    }
    (win as WindowWithTokagentConfig).TOKAGENT_CONFIG = config;
  });
});

// TypeScript definitions
declare global {
  namespace Cypress {
    interface Chainable {
      shouldBeDarkMode(): Chainable<JQuery<HTMLElement>>;
      setTokagentConfig(config: { agentId: string; apiBase?: string }): Chainable<Window>;
      mount(component: React.ReactElement): Chainable<unknown>;
    }
  }
}

export {};
