
// @doc
//   http://w3c.github.io/aria/aria/aria.html#menuitem
// @copyright
//   © 2016-2017 Jarosław Foksa

import {html, createElement} from "../utils/element.js";
import {sleep} from "../utils/time.js";

let {max} = Math;
let easing = "cubic-bezier(0.4, 0, 0.2, 1)";
let $oldTabIndex = Symbol();

let shadowTemplate = html`
  <template>
    <style>
      :host {
        display: flex;
        flex-flow: row;
        align-items: center;
        position: relative;
        box-sizing: border-box;
        cursor: default;
        user-select: none;
        --trigger-effect: ripple; /* ripple, blink, none */
        --ripple-background: currentColor;
        --ripple-opacity: 0.1;
        --checkmark-d: path("M 37.5 65 L 21 48.9 L 15.7 54.35 L 37.5 76.1 L 84.3 29.3 L 78.8 23.8 Z");
        --checkmark-width: 24px;
        --checkmark-height: 24px;
        --checkmark-margin: 0 12px 0 0;
      }
      :host([hidden]) {
        display: none;
      }
      :host([disabled]) {
        pointer-events: none;
        opacity: 0.6;
      }
      :host(:focus) {
        outline: none;
      }
      :host-context([debug]):host(:focus) {
        outline: 2px solid red;
      }

      /**
       * Ripples
       */

      #ripples {
        position: absolute;
        z-index: 0;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        contain: strict;
        overflow: hidden;
      }

      #ripples .ripple {
        position: absolute;
        top: 0;
        left: 0;
        width: 200px;
        height: 200px;
        background: var(--ripple-background);
        opacity: var(--ripple-opacity);
        border-radius: 999px;
        transform: none;
        transition: all 800ms cubic-bezier(0.4, 0, 0.2, 1);
        will-change: opacity, transform;
        pointer-events: none;
      }

      /**
       * Checkmark
       */

      #checkmark {
        color: inherit;
        display: none;
        transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
        align-self: center;
        width: var(--checkmark-width);
        height: var(--checkmark-height);
        margin: var(--checkmark-margin);
        d: var(--checkmark-d);
      }
      :host([togglable]) #checkmark {
        display: flex;
        transform: scale(0);
        transform-origin: 50% 50%;
      }
      :host([toggled]) #checkmark {
        display: flex;
        transform: scale(1);
      }

      #checkmark path {
        d: inherit;
        fill: currentColor;
      }

      /**
       * "Expand" arrow icon
       */

      #arrow-icon {
        display: flex;
        width: 16px;
        height: 16px;
        transform: scale(1.1);
        align-self: center;
        margin-left: 8px;
        color: inherit;
      }
      #arrow-icon[hidden] {
        display: none;
      }
    </style>

    <div id="ripples"></div>

    <svg id="checkmark" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path></path>
    </svg>

    <slot></slot>
    <x-icon id="arrow-icon" name="play-arrow" hidden></x-icon>
  </template>
`;

// @events
//   toggle
export class XMenuItemElement extends HTMLElement {
  static get observedAttributes() {
    return ["disabled"];
  }

  // @info
  //   Value associated with this menu item (usually the command name).
  // @type
  //   string?
  // @default
  //   null
  // @attribute
  get value() {
    return this.hasAttribute("value") ? this.getAttribute("value") : null;
  }
  set value(value) {
    if (this.value !== value) {
      value === null ? this.removeAttribute("value") : this.setAttribute("value", value);
    }
  }

  // @type
  //   boolean
  // @default
  //   false
  // @attribute
  get toggled() {
    return this.hasAttribute("toggled");
  }
  set toggled(toggled) {
    toggled ? this.setAttribute("toggled", "") : this.removeAttribute("toggled");
  }

  // @type
  //   boolean
  // @default
  //   false
  // @attribute
  get togglable() {
    return this.hasAttribute("togglable");
  }
  set togglable(togglable) {
    togglable ? this.setAttribute("togglable", "") : this.removeAttribute("togglable");
  }

  // @type
  //   boolean
  // @default
  //   false
  // @attribute
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(disabled) {
    disabled ? this.setAttribute("disabled", "") : this.removeAttribute("disabled");
  }

  // @info
  //   Promise that is resolved when any trigger effects (such ripples or blinking) are finished.
  // @type
  //   Promise
  get whenTriggerEnd() {
    return new Promise((resolve) => {
      if (this["#ripples"].childElementCount === 0 && this._blinking === false) {
        resolve();
      }
      else {
        this._triggerEndCallbacks.push(resolve);
      }
    });
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  constructor() {
    super();

    this._observer = new MutationObserver(() => this._updateArrowIconVisibility());

    this._blinking = false;
    this._triggerEndCallbacks = [];

    this._shadowRoot = this.attachShadow({mode: "closed"});
    this._shadowRoot.append(document.importNode(shadowTemplate.content, true));

    this.addEventListener("pointerdown", (event) => this._onPointerDown(event));
    this.addEventListener("click", (event) => this._onClick(event));
    this.addEventListener("keydown", (event) => this._onKeyDown(event));

    for (let element of this._shadowRoot.querySelectorAll("[id]")) {
      this["#" + element.id] = element;
    }
  }

  connectedCallback() {
    this._observer.observe(this, {childList: true, attributes: false, characterData: false, subtree: false});
    this._updateArrowIconVisibility();
    this._updateAccessabilityAttributes();
  }

  disconnectedCallback() {
    this._observer.disconnect();
  }

  attributeChangedCallback(name) {
    if (name === "disabled") {
      this._onDisabledAttributeChange();
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  _updateArrowIconVisibility() {
    if (this.parentElement.localName === "x-menubar") {
      this["#arrow-icon"].hidden = true;
    }
    else {
      let menu = this.querySelector("x-menu");
      this["#arrow-icon"].hidden = menu ? false : true;
    }
  }

  _updateAccessabilityAttributes() {
    this.setAttribute("role", "menuitem");
    this.setAttribute("aria-disabled", this.disabled);

    if (this.disabled) {
      this[$oldTabIndex] = (this.tabIndex > 0 ? this.tabIndex : 0);
      this.tabIndex = -1;
    }
    else {
      if (this.tabIndex < 0) {
        this.tabIndex = (this[$oldTabIndex] > 0) ? this[$oldTabIndex] : 0;
      }

      delete this[$oldTabIndex];
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  _onDisabledAttributeChange() {
    this._updateAccessabilityAttributes();
  }

  async _onPointerDown(pointerDownEvent) {
    if (pointerDownEvent.buttons !== 1) {
      return false;
    }

    if (this.matches("[closing] x-menuitem")) {
      pointerDownEvent.preventDefault();
      pointerDownEvent.stopPropagation();
      return;
    }

    pointerDownEvent.stopPropagation();

    // Trigger effect
    {
      let triggerEffect = getComputedStyle(this).getPropertyValue("--trigger-effect").trim();

      if (triggerEffect === "ripple") {
        let rect = this["#ripples"].getBoundingClientRect();
        let size = max(rect.width, rect.height) * 1.5;
        let top  = pointerDownEvent.clientY - rect.y - size/2;
        let left = pointerDownEvent.clientX - rect.x - size/2;
        let whenLostPointerCapture = new Promise((r) => this.addEventListener("lostpointercapture", r, {once: true}));

        let ripple = createElement("div");
        ripple.setAttribute("class", "ripple pointer-down-ripple");
        ripple.setAttribute("style", `width: ${size}px; height: ${size}px; top: ${top}px; left: ${left}px;`);
        this["#ripples"].append(ripple);

        this.setPointerCapture(pointerDownEvent.pointerId);

        let inAnimation = ripple.animate(
          { transform: ["scale3d(0, 0, 0)", "none"]},
          { duration: 300, easing }
        );

        await whenLostPointerCapture;
        await inAnimation.finished;

        let outAnimation = ripple.animate(
          { opacity: [getComputedStyle(ripple).opacity, "0"]},
          { duration: 300, easing }
        );

        await outAnimation.finished;
        ripple.remove();

        if (this["#ripples"].childElementCount === 0) {
          for (let callback of this._triggerEndCallbacks) {
            callback();
          }
        }
      }
    }
  }

  async _onClick(event) {
    if (
      event.button > 0 ||
      event.target.closest("x-menuitem") !== this ||
      event.target.closest("x-menu") !== this.closest("x-menu") ||
      this.matches("[closing] x-menuitem")
    ) {
      return;
    }

    if (this.togglable) {
      let event = new CustomEvent("toggle", {bubbles: true, cancelable: true});
      this.dispatchEvent(event);

      if (event.defaultPrevented === false) {
        this.toggled = !this.toggled;
      }
    }

    // Trigger effect
    {
      let triggerEffect = getComputedStyle(this).getPropertyValue("--trigger-effect").trim();

      if (triggerEffect === "ripple") {
        if (this["#ripples"].querySelector(".pointer-down-ripple") === null) {
          let rect = this["#ripples"].getBoundingClientRect();
          let size = max(rect.width, rect.height) * 1.5;
          let top  = (rect.y + rect.height/2) - rect.y - size/2;
          let left = (rect.x + rect.width/2) - rect.x - size/2;

          let ripple = createElement("div");
          ripple.setAttribute("class", "ripple click-ripple");
          ripple.setAttribute("style", `width: ${size}px; height: ${size}px; top: ${top}px; left: ${left}px;`);
          this["#ripples"].append(ripple);

          let inAnimation = ripple.animate(
            { transform: ["scale3d(0, 0, 0)", "none"]},
            { duration: 300, easing }
          );

          await inAnimation.finished;

          let outAnimation = ripple.animate(
            { opacity: [getComputedStyle(ripple).opacity, "0"] },
            { duration: 300, easing }
          );

          await outAnimation.finished;

          ripple.remove();

          if (this["#ripples"].childElementCount === 0) {
            for (let callback of this._triggerEndCallbacks) {
              callback();
            }
          }
        }
      }

      else if (triggerEffect === "blink") {
        this._blinking = true;

        this.parentElement.focus();
        await sleep(150);
        this.focus();
        await sleep(150);

        this._blinking = true;

        for (let callback of this._triggerEndCallbacks) {
          callback();
        }
      }
    }
  }

  _onKeyDown(event) {
    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();

      if (!this.querySelector("x-menu")) {
        event.stopPropagation();
        this.click();
      }
    }
  }
}

customElements.define("x-menuitem", XMenuItemElement);
