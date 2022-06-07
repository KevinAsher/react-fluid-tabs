// @ts-nocheck
import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import useWindowSize from "./useWindowSize";
import animateScrollTo from "animated-scroll-to";
import ReactDOM from 'react-dom';

function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}


function scrollPromise(element, options) {
  return new Promise((resolve, reject) => {

      element.parentElement.scroll(options);
      const intersectionObserver = new IntersectionObserver((entries) => {
        let [entry] = entries;
        
        if (entry.isIntersecting) {
        
          intersectionObserver.unobserve(element);
          resolve();
        }
      }, {root: element.parentElement, threshold: 1.0 });
      
      // I start to observe the element where I scrolled 
      intersectionObserver.observe(element);
  })
}

const RIGHT = "RIGHT";
const LEFT = "LEFT";

function calculateScaleX(nextTabWidth, currentTabWidth, currentTabScrollProgress) {
  let scaleX;
  const tabWidthRatio = nextTabWidth / currentTabWidth;

  if (tabWidthRatio < 1) {
    scaleX = 1 - currentTabScrollProgress * (1 - tabWidthRatio);
  } else {
    scaleX = 1 + currentTabScrollProgress * (tabWidthRatio - 1);
  }

  return scaleX;
}

function calculateTransform({currentTab, previousTab, nextTab, direction, relativeScroll, currentTabIndex, tabRefs}) {
    let currentTabScrollProgress;
    let scaleX;
    let translateX;
    let nextTabWidth;
    let currentTabWidth = currentTab.clientWidth;
    let offsetLeft = currentTab.offsetLeft || 0;

    if (currentTab !== nextTab || previousTab !== currentTab) {
      currentTabScrollProgress = direction === RIGHT ? relativeScroll % 1 : 1 - (relativeScroll % 1);

      nextTabWidth = nextTab.clientWidth;

      if (direction === RIGHT) {
        translateX = offsetLeft + (relativeScroll % 1) * currentTabWidth;
      } else {
        translateX = offsetLeft - (1 - (relativeScroll % 1 || 1)) * nextTabWidth;
      }
    } else {
      currentTabScrollProgress = direction === RIGHT ? 1 - (relativeScroll % 1 || 1) : relativeScroll % 1;

      let wasGonnaBeNextTabIndex;
      let wasGonnaBeNextTab;
      if (direction === LEFT) {
        wasGonnaBeNextTabIndex = clamp(currentTabIndex + 1, 0, tabRefs.current.length-1);
      } else {
        wasGonnaBeNextTabIndex = clamp(currentTabIndex - 1, 0, tabRefs.current.length-1);
      }

      wasGonnaBeNextTab = tabRefs.current[wasGonnaBeNextTabIndex];
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
    setTabPanelsClientWidth(tabPanelsRef.current.clientWidth);
  }, [width]);

  return tabPanelsClientWidth;
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
} 

function getWorkingTabs({previousTab, previousIndex, tabRefs, direction, relativeScroll, previousRelativeScroll}) {
  let currentTab = null;
  if (previousTab === null) {
    currentTab = tabRefs.current[previousIndex || 0];
    previousTab = currentTab;
  }

  if (direction === RIGHT) {
    if (Math.trunc(relativeScroll) > Math.trunc(previousRelativeScroll)) {
      currentTab = tabRefs.current[Math.trunc(relativeScroll)];
    } else {
      currentTab = previousTab;
    }
  } else if (direction === LEFT) {
    if (
      Math.trunc(relativeScroll) < Math.trunc(previousRelativeScroll) ||
      relativeScroll % 1 === 0
    ) {
      currentTab = tabRefs.current[Math.trunc(previousRelativeScroll)];
    } else {
      currentTab = previousTab;
    }
  }

  let nextTabIndex;
  let lastTabIndex = tabRefs.current.length - 1;
  
  if (direction === RIGHT) {
    nextTabIndex = clamp(Math.ceil(relativeScroll), 0, lastTabIndex);
  } else {
    nextTabIndex = clamp(Math.floor(relativeScroll), 0, lastTabIndex);
  }

  let nextTab = tabRefs.current[nextTabIndex];

  if (relativeScroll < 0 || relativeScroll > lastTabIndex) {
    previousTab = nextTab;
    currentTab = nextTab;
  }
  
  return { previousTab, currentTab, nextTab, }
}

export default function useReactiveTabIndicator({ tabRefs, tabPanelsRef, tabIndicatorRef, defaultIndex=0 }) {
  const [tabIndicatorWidth, setTabIndicatorWidth] = useState(null);
  const previousRelativeScrollRef = useRef(0);
  const indicatorTranslateXRef = useRef(0);
  const indicatorScaleXRef = useRef(1);
  const [index, setIndex] = useState(defaultIndex);
  const previousTabRef = useRef(null);
  const previousIndex = usePrevious(index);
  const shouldSkipSettingIndexRef = useRef(false);
  const shouldSkipForcedScrollRef = useRef(false);
  const tabPanelsClientWidth = useTabPanelsClientWidth(tabPanelsRef);

  useLayoutEffect(() => {
    setTabIndicatorWidth(tabRefs.current[index].clientWidth);
    shouldSkipForcedScrollRef.current = true;
  }, [tabPanelsClientWidth]);

  useLayoutEffect(() => {
    if (index === defaultIndex && tabIndicatorRef.current) {
      tabPanelsRef.current.scrollLeft = index * tabPanelsClientWidth;
    }
  }, [tabPanelsClientWidth, tabIndicatorRef.current])

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
          }

        }).catch(() => {
            tabPanelsRef.current.style = "scroll-snap-type: x mandatory";
        });

    } else {
      shouldSkipForcedScrollRef.current = false;
    }
  }, [index, tabPanelsClientWidth]);

  const onScroll = React.useCallback((e) => {

    const relativeScrollRaw = e.target.scrollLeft / tabPanelsClientWidth;
    const relativeScroll = relativeScrollRaw % 1 < 0.01 ? Math.round(relativeScrollRaw) : relativeScrollRaw;
    const direction = previousRelativeScrollRef.current <= relativeScroll ? RIGHT : LEFT;


    /*
      currentTab floats from previousTab to currentTab when the previousTab and nextTab are adjacent,
      also, currentTab has the value of previousTab until the last scroll callback, in which it becomes 
      next tab. Otherwise, currentTab can have an intermediate tab value, but only for a single scroll callback, 
      because the previous tab will get the value of the intermediate tab in the next scroll callback.
    */
    
    let {previousTab, currentTab, nextTab} = getWorkingTabs({
      previousTab: previousTabRef.current,
      previousIndex,  
      tabRefs,
      direction,
      relativeScroll,
      previousRelativeScroll: previousRelativeScrollRef.current,
    });

    previousTabRef.current = previousTab;

    const currentTabIndex = tabRefs.current.findIndex(tab => tab === currentTab);

    let { translateX, scaleX } = calculateTransform({
      currentTab, 
      previousTab, 
      nextTab, 
      direction, 
      relativeScroll, 
      currentTabIndex, 
      tabRefs,
    });

    indicatorScaleXRef.current = scaleX;
    indicatorTranslateXRef.current = translateX;
    
    requestAnimationFrame(() => {
      const scaleXCss = `scaleX(${indicatorScaleXRef.current})`;
      const translateXCss = `translateX(${indicatorTranslateXRef.current}px)`;

      tabIndicatorRef.current.style.transform = `${translateXCss} ${scaleXCss}`;
    });

    previousRelativeScrollRef.current = relativeScroll;

    if (previousTab === currentTab) return;
    
    previousTabRef.current = currentTab;

    /* 
      Update the tab indicator width outside React for performance reasons. This will
      cause this element to be out of sync between react and the dom but it's a temporary out of sync.
      This is only for when the indicator is passing by other elements until it reaches it's
      destination tab. Once it reaches it, we re-sync the elements width with it's actual state.
    */
    tabIndicatorRef.current.style.width = currentTab.clientWidth + 'px';

    if (index === currentTabIndex) {
      setTabIndicatorWidth(currentTab.clientWidth);
    } else if (!shouldSkipSettingIndexRef.current) {
      shouldSkipForcedScrollRef.current = true;
      setIndex(currentTabIndex);
      setTabIndicatorWidth(currentTab.clientWidth);
    }
    
  }, [tabPanelsClientWidth, index]);

  React.useLayoutEffect(() => {
    tabPanelsRef.current.addEventListener("scroll", onScroll);

    return () => {
      tabPanelsRef.current.removeEventListener("scroll", onScroll);
    };
  }, [onScroll]);

  return { tabIndicatorWidth, index, setIndex };
}