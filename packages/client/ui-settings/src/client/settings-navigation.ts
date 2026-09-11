/** Client command bridge for opening the settings dialog on a named section. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

/** One immutable request for the settings-shell modal. */
export interface SettingsNavigationRequest {
  /** Monotonic request identity so repeated requests for one section are observable. */
  readonly revision: number
  /** Registered settings-section id to select when the modal opens. */
  readonly section: string
}

/** Cross-feature command used by full-screen surfaces to reach the settings modal. */
export interface SettingsNavigation {
  /** Observable modal-open requests owned by the settings shell. */
  readonly requests: HostObservable<SettingsNavigationRequest | undefined>
  /** Open the settings modal and select one registered section. */
  open(section: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Global settings-modal navigation capability. */
    settingsNavigation: SettingsNavigation
  }
}

/** Publishes full-screen feature requests to the settings-shell owner. */
export class SettingsNavigationService extends Service implements SettingsNavigation {
  private readonly listeners = new Set<() => void>()
  private revision = 0
  private snapshot: SettingsNavigationRequest | undefined

  readonly requests: HostObservable<SettingsNavigationRequest | undefined> = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  /** @param ctx - owning settings-domain context. */
  constructor(ctx: Context) { super(ctx, 'settingsNavigation') }

  /** @param section - registered settings-section id to reveal. */
  open(section: string): void {
    this.snapshot = { revision: ++this.revision, section }
    for (const listener of [...this.listeners]) listener()
  }
}
