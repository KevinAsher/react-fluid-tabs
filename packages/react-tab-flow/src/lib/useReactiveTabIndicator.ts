// @ts-nocheck
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import useWindowSize from "./useWindowSize";
import animateScrollTo from "animated-scroll-to";

// Simple fallback for React versions before 18
let startTransition = React.startTransition || (cb => cb());

function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

const RIGHT = "RIGHT";
const LEFT = "LEFT";

function calculateScaleX(nextTabWidth, currentTabWidth, currentTabScrollProgress) {
  let scaleX = 1;
  const tabWidthRatio = nextTabWidth / currentTabWidth;

  if (tabWidthRatio < 1) {
    scaleX = 1 - currentTabScrollProgress * (1 - tabWidthRatio);
  } else {
    scaleX = 1 + currentTabScrollProgress * (tabWidthRatio - 1);
  }

  return scaleX;
}

function calculateTransform({currentTab, previousTab, nextTab, direction, relativeScroll, currentTabIndex, tabs}) {
    let currentTabScrollProgress;
    let scaleX;
    let translateX = 0;
    let nextTabWidth;
    let currentTabWidth = currentTab.clientWidth;
    let offsetLeft = currentTab.offsetLeft;

    if (currentTab !== nextTab || previousTab !== currentTab) {
      currentTabScrollProgress = direction === RIGHT ? relativeScroll % 1 : 1 - (relativeScroll % 1);

      nextTabWidth = nextTab.clientWidth;

      if (direction === RIGHT) {
        translateX = offsetLeft + (relativeScroll % 1) * currentTabWidth;
      } else {
        translateX = offsetLeft - (1 - (relativeScroll % 1 || 1)) * nextTabWidth;
      }
    } else if (relativeScroll >= 0 && relativeScroll <= tabs.length - 1) {
      currentTabScrollProgress = direction === RIGHT ? 1 - (relativeScroll % 1 || 1) : relativeScroll % 1;

      let wasGonnaBeNextTabIndex;
      let wasGonnaBeNextTab;
      if (direction === LEFT) {
        wasGonnaBeNextTabIndex = clamp(currentTabIndex + 1, 0, tabs.length-1);
      } else {
        wasGonnaBeNextTabIndex = clamp(currentTabIndex - 1, 0, tabs.length-1);
      }

      wasGonnaBeNextTab = tabs[wasGonnaBeNextTabIndex];
      nextTabWidth = wasGonnaBeNextTab.clientWidth;

      if (direction === RIGHT) {
        translateX = offsetLeft - currentTabScrollProgress * nextTabWidth;
      } else {
        translateX = offsetLeft + currentTabScrollProgress * currentTabWidth;
      }
    }

    scaleX = calculateScaleX(nextTabWidth, currentTabWidth, currentTabScrollProgress);

    return { scaleX, translateX };
}

/*
  Only read the client width of the tab panels on initialization and
  width update (most likely screen orientation change).
*/
function useTabPanelsClientWidth(tabPanelsRef) {
  const [tabPanelsClientWidth, setTabPanelsClientWidth] = useState();
  const { width } = useWindowSize();

  useEffect(() => {
    setTabPanelsClientWidth(tabPanelsRef.current.getBoundingClientRect().width);
  }, [width]);

  return tabPanelsClientWidth;
}

function useIsTouchingRef(ref) {
  const isTouchingRef = useRef(false);

  useEffect(() => {

    function setTouchingFlag() {
      isTouchingRef.current = true;
    }

    function unsetTouchingFlag() {
      isTouchingRef.current = false;
    }

    ref.current?.addEventListener('touchstart', setTouchingFlag, {passive: true});
    ref.current?.addEventListener('touchend', unsetTouchingFlag, {passive: true});
    return () => {
      ref.current?.removeEventListener('touchstart', setTouchingFlag);
      ref.current?.removeEventListener('touchend', unsetTouchingFlag);
    }
  }, []);

  return isTouchingRef;
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
} 

function getWorkingTabs({previousTab, previousIndex, tabsRef, direction, relativeScroll, previousRelativeScroll}) {
  let currentTab = tabsRef.current[previousIndex];

  if (previousTab === null) {
    previousTab = currentTab;
  }

  if (direction === RIGHT) {
    if (Math.trunc(relativeScroll) > Math.trunc(previousRelativeScroll)) {
      currentTab = tabsRef.current[Math.trunc(relativeScroll)];
    } else {
      currentTab = previousTab;
    }
  } else {
    if (
      Math.trunc(relativeScroll) < Math.trunc(previousRelativeScroll) ||
      relativeScroll % 1 === 0
    ) {
      currentTab = tabsRef.current[Math.trunc(previousRelativeScroll)];
    } else {
      currentTab = previousTab;
    }
  }

  let nextTab = tabsRef.current[direction === RIGHT ? Math.ceil(relativeScroll) : Math.floor(relativeScroll)];

  return { previousTab, currentTab, nextTab }
}


// Depending on the device pixel ratio, a scroll container might not be able
// to scroll until it's full width as it should (might be a browser bug). Since the definition is unclear,
// we define an empirical limit ratio.
const SCROLL_RATIO_LIMIT = 0.001;

export default function useReactiveTabIndicator({ tabPanelsRef, index, setIndex, preemptive=false, lockScrollWhenSwiping=false  }) {
  const [tabIndicatorStyles, setTabIndicatorStyles] = useState(null);
  const previousRelativeScrollRef = useRef(0);
  const previousTabRef = useRef(null);
  const previousIndex = usePrevious(index);
  const shouldSkipSettingIndexRef = useRef(false);
  const shouldSkipForcedScrollRef = useRef(false);
  const tabPanelsClientWidth = useTabPanelsClientWidth(tabPanelsRef);
  const isTouchingRef = useIsTouchingRef(tabPanelsRef);
  const tabIndicatorRef = useRef(null);
  const tabsRef = useRef([]);
  const indexRef = useRef(index);

  useLayoutEffect(() => {
    // Skip forced scroll on mount
    shouldSkipForcedScrollRef.current = true;
  }, []);

  // Effect runs when the scroll container width changes, e.g. mobile orientation changed.
  useLayoutEffect(() => {
    setTabIndicatorStyles({width: tabsRef.current[indexRef.current].clientWidth});

    if (tabPanelsRef.current) {
      tabPanelsRef.current.scrollLeft = indexRef.current * tabPanelsClientWidth;
    }
  }, [tabPanelsClientWidth]);
  
  // Run the below effect on index change.
  // If a tab was clicked (index changed), we need to synchronize the scroll position.
  // Certain cases when updating the current index (e.g., preemptive mode), we should'nt synchronize
  // the scroll position, so we keep it behind a flag, but also, re-enable the flag once we skiped it once.
  useEffect(() => {

    if (!shouldSkipForcedScrollRef.current) {
      shouldSkipSettingIndexRef.current = true;
      tabPanelsRef.current.style = "scroll-snap-type: none";
      animateScrollTo([index * tabPanelsRef.current.clientWidth, 0], {
        elementToScroll: tabPanelsRef.current,
        minDuration: 500,
        cancelOnUserAction: false,
        maxDuration: 1000,

        easing: (t) => {
          return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
        }
      })
        .then((hasScrolledToPosition) => {
          shouldSkipSettingIndexRef.current = false;
          if (hasScrolledToPosition) {
            tabPanelsRef.current.style = "scroll-snap-type: x mandatory";


            // On ios < 15, setting scroll-snap-type resets the scroll position
            // so we need to reajust it to where it was before.
            tabPanelsRef.current.scrollTo(
              index * tabPanelsRef.current.clientWidth,
              0
            );
          }

        }).catch(() => {
            tabPanelsRef.current.style = "scroll-snap-type: x mandatory";
        });

    } else {
      shouldSkipForcedScrollRef.current = false;
    }
  }, [index]);

  const onScroll = useCallback((e) => {
    // Total amount of pixels scrolled in the scroll container
    const scrollLeft = e.target.scrollLeft;

    // Scroll progress relative to the panel, e.g., 0.4 means we scrolled the 40% the first panel
    const relativeScrollRaw = scrollLeft / tabPanelsRef.current.clientWidth;

    const index = indexRef.current;

    const closestTabPanelIndex = Math.round(relativeScrollRaw);

    const relativeScroll = Math.abs(closestTabPanelIndex - relativeScrollRaw) < SCROLL_RATIO_LIMIT ? closestTabPanelIndex : relativeScrollRaw;
    const direction = previousRelativeScrollRef.current <= relativeScroll ? RIGHT : LEFT;

    if (relativeScroll < 0 || relativeScroll > tabsRef.current.length - 1) return;

    let {previousTab, currentTab, nextTab} = getWorkingTabs({
      previousTab: previousTabRef.current,
      previousIndex,  
      tabsRef,
      direction,
      relativeScroll,
      previousRelativeScroll: previousRelativeScrollRef.current,
    });

    previousTabRef.current = previousTab;

    if (preemptive && !isTouchingRef.current) {
      if (closestTabPanelIndex !== index && !shouldSkipSettingIndexRef.current) {
        startTransition(() => {
          setIndex(closestTabPanelIndex);
          shouldSkipForcedScrollRef.current = true;
        })
      }
    }
    
    const currentTabIndex = tabsRef.current.findIndex(tab => tab === currentTab);

    let { translateX, scaleX } = calculateTransform({
      currentTab, 
      previousTab, 
      nextTab, 
      direction, 
      relativeScroll, 
      currentTabIndex, 
      tabs: tabsRef.current,
    });

    requestAnimationFrame(() => {
      const scaleXCss = `scaleX(${scaleX})`;
      const translateXCss = `translateX(${translateX}px)`;

      tabIndicatorRef.current.style.transform = `${translateXCss} ${scaleXCss}`;
      if (lockScrollWhenSwiping) tabPanelsRef.current.style.touchAction = relativeScroll !== index ? 'pan-x' : 'auto';
    });

    previousRelativeScrollRef.current = relativeScroll;

    if (previousTab === currentTab) return;
    previousTabRef.current = currentTab;


    requestAnimationFrame(() => {
      /* 
        Update the tab indicator width outside React for performance reasons. This will
        cause this element to be out of sync between react and the dom but it's a temporary out of sync.
        This is only for when the indicator is passing by other elements until it reaches it's
        destination tab. Once it reaches it, we re-sync the elements width with it's actual state.
      */
      tabIndicatorRef.current.style.width = currentTab.clientWidth + 'px';
      if (lockScrollWhenSwiping) tabPanelsRef.current.style.touchAction = 'auto';
    })

    if (index === currentTabIndex) {
      startTransition(() => {
        setTabIndicatorStyles({width: currentTab.clientWidth})
      })
    } else if (!shouldSkipSettingIndexRef.current) {
      shouldSkipForcedScrollRef.current = true;
      startTransition(() => {
        setIndex(currentTabIndex);
        setTabIndicatorStyles({width: currentTab.clientWidth})
      })
    }
  }, [lockScrollWhenSwiping, preemptive]);
 
  
  // Latest ref pattern - avoid recreating events on index change - we don't 
  // want to reattach scroll event listeners on preemptive mode, which might cause us
  // to lose a frame? (needs testing).
  useLayoutEffect(() => {
    indexRef.current = index;
  });

  useEffect(() => {
    tabPanelsRef.current?.addEventListener("scroll", onScroll);

    return () => {
      tabPanelsRef.current?.removeEventListener("scroll", onScroll);
    };
  }, [onScroll]);


  return { tabIndicatorStyles, tabIndicatorRef, tabPanelsRef, tabsRef };
}