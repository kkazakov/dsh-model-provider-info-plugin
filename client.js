/**
 * Provider-aware label for the composer's model selector.
 *
 * The shipped model selection plugin exposes `conversation.input.model.label`
 * as an inline single-slot contribution point and renders it in three places:
 * the trigger caption (`trigger`), the root menu's Model row value (`menu`),
 * and each selectable model row (`option`). A contribution replaces the
 * catalog name there, so this module renders the provider alongside the name:
 *
 * - `trigger`: "provider: model" on the selected chip.
 * - `menu`: the provider name on its own line above the model name.
 * - `option`: the plain model name, because the drilled list already groups
 *   models under a provider heading.
 *
 * Everything the label says is catalog data (provider name, model name); no UI
 * copy is introduced, and only host theme tokens are referenced.
 */
window.__ModuleLoader__.load({
  id: '@wasp/dsh-model-provider-info',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Provider token on the chip stays in the selector's caption tone. */
    const chipProvider = {
      color: 'var(--dsw-alias-label-caption)',
      whiteSpace: 'nowrap',
    };
    /** Root-menu value: provider line above the model name, both right-aligned. */
    const menuStack = {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      minWidth: 0,
      maxWidth: '100%',
      whiteSpace: 'nowrap',
    };
    const menuProvider = {
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: 'var(--dsw-alias-label-caption)',
      fontSize: '11px',
      lineHeight: '13px',
    };
    const menuModel = {
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      color: 'var(--dsw-alias-label-tertiary)',
      fontSize: '13px',
      lineHeight: '17px',
    };

    /**
     * Provider text: the catalog's localized display name, falling back to the
     * id when a provider has no display name (it then equals the id).
     * @param provider - the slot owner's provider share.
     * @returns the display name, or ''.
     */
    function providerNameOf(provider) {
      if (provider === null || typeof provider !== 'object') return '';
      if (typeof provider.name === 'string' && provider.name !== '') return provider.name;
      return typeof provider.id === 'string' ? provider.id : '';
    }

    function modelNameOf(model) {
      return model !== null && typeof model === 'object' && typeof model.name === 'string'
        ? model.name
        : '';
    }

    /**
     * Render one model label for the placement that asked for it.
     * @param props - owner share: provider, model, placement, selected.
     * @returns the label content for that placement.
     */
    function ModelProviderLabel(props) {
      const providerName = providerNameOf(props.provider);
      const name = modelNameOf(props.model);

      if (props.placement === 'trigger') {
        return h(
          'span',
          null,
          providerName === '' ? null : h('span', { style: chipProvider }, providerName + ': '),
          h('span', null, name),
        );
      }

      if (props.placement === 'menu') {
        return h(
          'span',
          { style: menuStack },
          // The trailing space keeps the two lines apart in the accessible
          // name; it is invisible at the end of the right-aligned line.
          providerName === '' ? null : h('span', { style: menuProvider }, providerName + ' '),
          h('span', { style: menuModel }, name),
        );
      }

      return name;
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // The seat declares this child slot when it registers; inject() runs
        // the registration whenever that declaration is live.
        ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register(
          { name: 'conversation.input.model.label' },
          ModelProviderLabel,
        ));
      },
    };
  },
});