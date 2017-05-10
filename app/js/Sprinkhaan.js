import EventEmitter from 'events';
import 'web-animations/web-animations-next.min';
import ZingTouch from 'zingtouch';

class Sprinkhaan extends EventEmitter {

    prefix = '.sprinkhaan-';
    easing = 'cubic-bezier(.61,.14,.5,.93)';

    selector = '#sprinkhaan';
    element = false;
    elements = {
        'content-wrapper': false,
        'header.is-sticky': false,
        'header.is-not-sticky': false,
        'content': false,
        'media': false,
        'inner': false,
        'close-button': false
    };

    speed = 300;
    threshold = 30;

    animations = {
        teaser: {},
        popup: {}
    };

    boundEvents = {};

    touchRegion = false;
    panningStartTarget = false;
    panningStartY = false;

    properties = {
        state: 'hidden',
        isAnimating: false,
        isPanning: false
    };

    constructor (options) {
        super();
        Object.assign(this, options);

        this.element = document.querySelector(this.selector);
        if (!this.element) { throw 'Sprinkhaan needs a valid element to function'; }

        Object.keys(this.elements).forEach((subElement) => {
            this.elements[subElement] = this.element.querySelector(this.prefix + subElement);
        });

        this.elements['content'].style.marginTop = this.elements['header.is-not-sticky'].clientHeight + 'px';
        this.createAnimations();
        this.attachEventHandlers();
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API
    createAnimations () {
        let finished = () => {
            this.isAnimating = false;

            // Somehow we need to recreate the animations on each end.
            // It could be I don't understand correctly how it works.
            // TODO find out why.
            this.createAnimations();
        };

        let teaserKeyFrames = new KeyframeEffect(
            this.elements['content-wrapper'],
            [
                { transform: 'translateY(' + window.innerHeight + 'px) translateY(0)' },
                { transform: 'translateY(' + window.innerHeight + 'px) translateY(-' + this.elements['header.is-not-sticky'].clientHeight + 'px)' }
            ],
            {
                duration: this.speed,
                fill: 'both',
                easing: this.easing
            }
        );

        this.animations.teaser = new Animation(teaserKeyFrames, document.timeline);
        this.animations.teaser.onfinish = finished;

        let popupMediaKeyFrames = new KeyframeEffect(
            this.elements['media'],
            [
                { transform: 'translateY(' + (window.innerHeight - this.elements['header.is-not-sticky'].clientHeight) + 'px)' },
                { transform: 'translateY(0)' }
            ],
            {
                duration: this.speed,
                fill: 'both',
                easing: this.easing
            }
        );

        this.animations.popup.media = new Animation(popupMediaKeyFrames, document.timeline);
        this.animations.popup.media.onfinish = finished;

        let popupContentWrapperKeyFrames = new KeyframeEffect(
            this.elements['content-wrapper'],
            [
                { transform: 'translateY(' + window.innerHeight + 'px) translateY(-' + this.elements['header.is-not-sticky'].clientHeight + 'px)' },
                { transform: 'translateY(' + this.elements['media'].clientHeight + 'px) translateY(0)' }
            ],
            {
                duration: this.speed,
                fill: 'both',
                easing: this.easing
            }
        );

        this.animations.popup.contentWrapper = new Animation(popupContentWrapperKeyFrames, document.timeline);
        this.animations.popup.contentWrapper.onfinish = finished;
    }

    attachEventHandlers () {
        this.touchRegion = new ZingTouch.Region(document.body);
        this.touchRegion.bind(this.elements['close-button'], 'tap', () => this.collapse());
        this.touchRegion.bind(this.elements['header.is-not-sticky'], 'tap', () => this.expand());
        this.touchRegion.bind(this.element, 'pan', (event) => this.pan(event));

        // These handlers need unbind, see destroy().
        this.boundEvents = {
            resize: (event) => this.resizeWindow(event),
            orientationchange: (event) => this.resizeWindow(event),
            touchend: (event) => this.panEnd(event),
            mouseup: (event) => this.panEnd(event),
            scroll: (event) => this.elementScroll(event),
            wheel: (event) => this.wheelScroll(event),
        };

        window.addEventListener('resize', this.boundEvents.resize);
        window.addEventListener('orientationchange', this.boundEvents.orientationchange);
        document.body.addEventListener('touchend', this.boundEvents.touchend);
        document.body.addEventListener('mouseup', this.boundEvents.mouseup);
        this.elements['inner'].addEventListener('scroll', this.boundEvents.scroll);
        window.addEventListener('wheel', this.boundEvents.wheel);
    }

    resizeWindow () {
        this.animations.popup.media.pause();
        this.animations.popup.contentWrapper.pause();

        if (this.state === 'collapsed') {
            this.animations.popup.media._animation.currentTime = 0;
            this.animations.popup.contentWrapper._animation.currentTime = 0;
        }

        if (this.state === 'expanded') {
            this.animations.popup.media._animation.currentTime = 300;
            this.animations.popup.contentWrapper._animation.currentTime = 300;
        }

        this.createAnimations();
    }

    panStart (event) {
        this.isPanning = true;
        this.animations.popup.media.pause();
        this.animations.popup.contentWrapper.pause();
        this.panningStartTarget = event.detail.events[0].originalEvent.target;
        this.panningStartY = event.detail.events[0].clientY;
    }

    pan (event) {
        // Shorter references so the code below is readable.
        let mediaAnim = this.animations.popup.media;
        let contentWrapperAnim = this.animations.popup.contentWrapper;
        let panDirection = event.detail.events[0].clientY <= this.panningStartY ? 'up' : 'down';

        let els = this.elements;
        if (this.isAnimating || els['inner'].scrollTop !== 0) { return; }

        // Switching from expanding/collapsing to scrolling in the popup.
        if (panDirection === 'up' && els['inner'].scrollTop === 0 && this.state === 'expanded') {
            return;
        }

        if (!this.isPanning) { this.panStart(event); }

        let offset = Math.abs(event.detail.events[0].clientY - this.panningStartY);

        let msPerPx = mediaAnim.effect.activeDuration / (window.innerHeight - els['media'].offsetHeight - els['header.is-not-sticky'].offsetHeight);
        let animationPosition = offset * msPerPx;

        // Panning up, dragging the header.
        if (this.state === 'collapsed' && this.panningStartTarget === els['header.is-not-sticky'] && panDirection === 'up') {
            // If you pan the popup up and you let it stop at 100% the web animation starts to play again.
            // So we want it to stop at 99.9% or the current position.
            mediaAnim._animation.currentTime = Math.min(mediaAnim.effect.activeDuration - .1, animationPosition);
            contentWrapperAnim._animation.currentTime = Math.min(contentWrapperAnim.effect.activeDuration - .1, animationPosition);
        }

        // Panning down.
        if (this.state === 'expanded' && els['inner'].scrollTop === 0 && panDirection === 'down' &&
            [els['content'], els['header.is-not-sticky'], els['media']].includes(this.panningStartTarget)
        ) {
            // Animating where the user drag the media element
            if (this.panningStartTarget === els['media']) {
                // We need to recalculate these items for the media animation.
                let msPerPx = mediaAnim.effect.activeDuration / (window.innerHeight - els['header.is-not-sticky'].offsetHeight);
                let animationPosition = offset * msPerPx;

                // We want the animation to start at 0 not before it.
                mediaAnim._animation.currentTime = Math.max(0, mediaAnim.effect.activeDuration - animationPosition);
                contentWrapperAnim._animation.currentTime = Math.max(0, contentWrapperAnim.effect.activeDuration - animationPosition);
            }

            // Animating where the user drag the header or the content element
            if ([els['content'], els['header.is-not-sticky']].includes(this.panningStartTarget)) {
                // We want the animation to start at 0 not before it.
                mediaAnim._animation.currentTime = Math.max(0, mediaAnim.effect.activeDuration - animationPosition);
                contentWrapperAnim._animation.currentTime = Math.max(0, contentWrapperAnim.effect.activeDuration - animationPosition);
            }
        }
    }

    panEnd (event) {
        let contentWrapperAnim = this.animations.popup.contentWrapper;

        // It skips the following line and collapses when scrolling in the content.
        if (!this.isPanning) { return; }

        let clientY = (event.clientY !== undefined) ? event.clientY : event.changedTouches[0].clientY;
        let panDirection = (clientY < this.panningStartY) ? 'up' : 'down';
        this.panningStartY = false;
        let percentageDone = Math.round(100 / contentWrapperAnim.effect.activeDuration * contentWrapperAnim._animation.currentTime);

        // No need to react.
        if (percentageDone === 100 && this.state === 'expanded' && panDirection === 'up' ||
            percentageDone === 100 && this.state === 'expanded' && panDirection === 'down'
        ) {
            this.isPanning = false;
            return;
        }

        // The following logic allows the poup to close or open depending on the percentage dragged.
        if (this.state === 'collapsed') {
            if (percentageDone > this.threshold) {
                this.expand();
            }
            else {
                this.collapse();
            }
        }
        else if (this.state === 'expanded') {
            percentageDone = 100 - percentageDone;

            if (percentageDone > this.threshold) {
                this.collapse();
            }
            else {
                this.expand();
            }
        }

        this.isPanning = false;
    }

    wheelScroll (event) {
        console.log('woops')
        if (this.isAnimating) { return; }
        let direction = event.deltaY < 0 ? 'down' : 'up';

        // The user has a mouse and scrolls on the header.
        if (event.target === this.elements['header.is-not-sticky'] &&
            this.state === 'collapsed' && direction === 'up' && this.elements['inner'].scrollTop === 0) {
            this.expand();
        }

        // If the user has a mouse en scrolls in the popup down.
        if (this.state === 'expanded' && this.elements['inner'].scrollTop === 0 && direction === 'down') {
            this.collapse();
        }
    }

    elementScroll () {
        this.element.dataset.preStickyHeader = this.elements['inner'].scrollTop > (this.elements['media'].clientHeight - 50);
        this.element.dataset.stickyHeader = this.elements['inner'].scrollTop > this.elements['media'].clientHeight;
    }

    get state () {
        return this.properties.state;
    }

    set state(state) {
        this.element.dataset.state = state;
        this.properties.state = state;
    }

    get isAnimating () {
        return this.properties.isAnimating;
    }

    set isAnimating(state) {
        this.element.dataset.animating = state;
        this.properties.isAnimating = state;
    }

    get isPanning () {
        return this.properties.isPanning;
    }

    set isPanning(state) {
        this.properties.isPanning = state;
    }

    expand () {
        if (this.isAnimating || this.state === 'expanded' && !this.isPanning) { return this; }
        this.animations.popup.media.play();
        this.animations.popup.contentWrapper.play();
        this.emit('open');
        this.isAnimating = true;
        this.touchRegion.preventDefault = false;
        this.state = 'expanded';
        return this;
    }

    collapse () {
        if (this.isAnimating || this.state === 'collapsed' && !this.isPanning) { return this; }
        this.scrollToTop(this.elements['inner'], () => {
            this.animations.popup.media.reverse();
            this.animations.popup.contentWrapper.reverse();
            this.touchRegion.preventDefault = true;
            this.isAnimating = true;
            this.state = 'collapsed';
        });

        return this;
    }

    show () {
        this.state = 'collapsed';
        this.animations.teaser.play();
        return this;
    }

    hide () {
        // TODO needs to work when state === 'expanded';
        this.animations.teaser.reverse();
        this.state = 'hidden';
        return this;
    }

    destroy () {
        // TODO this hide needs to be triggered when collapsed is finished with animating.
        this.collapse().hide();
        this.touchRegion.unbind(this.elements['close-button']);
        this.touchRegion.unbind(this.elements['header.is-not-sticky']);
        this.touchRegion.unbind(this.element);

        window.removeEventListener('resize', this.boundEvents.resize);
        window.removeEventListener('orientationchange', this.boundEvents.orientationchange);
        document.body.removeEventListener('touchend', this.boundEvents.touchend);
        document.body.removeEventListener('mouseup', this.boundEvents.mouseup);
        this.elements['inner'].removeEventListener('scroll', this.boundEvents.scroll);
        window.removeEventListener('wheel', this.boundEvents.wheel);
    }

    scrollToTop (element, callback) {
        if (element.scrollTop !== 0) {
            setTimeout(() => {
                element.scrollTop = Math.max(element.scrollTop - 50, 0);
                this.scrollToTop(element, callback);
            }, 1000 / 60);
        }
        else {
            callback();
        }
    }

}

export default Sprinkhaan;