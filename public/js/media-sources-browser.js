apos.define('media-sources-browser', {
  extend: 'apostrophe-modal',
  source: 'media-sources-browser',
  construct: (self, options) => {
    self.results = [];
    self.existingIds = [];
    self.choices = [];
    self.currentPage = 1;
    self.totalPages = 0;

    self.resizeContentHeight = () => {};

    self.beforeShow = async (callback) => {
      self.$manageView = self.$el.find('[data-apos-manage-view]');
      self.$filters = self.$modalFilters.find('[data-filters]');
      self.$items = self.$el.find('[data-items]');
      self.$searchInput = self.$el.find('.apos-modal-filters-search [data-media-sources-filter]')[0];
      self.provider = self.$el.find('[data-provider]')[0].innerHTML;

      const mediaSourceConnectors = JSON.parse(apos.mediaSourceConnectors);

      self.mediaSourceConnector = mediaSourceConnectors
        .find(connector => connector.label === self.provider);

      if (self.mediaSourceConnector.script) {
        if (!window[self.mediaSourceConnector.script.name]) {
          const jsScript = document.createElement('script');
          jsScript.src = self.mediaSourceConnector.script.src;
          document.body.appendChild(jsScript);
          jsScript.addEventListener('load', triggerScript);
        } else {
          triggerScript();
        }

        return callback();
      }

      self.enableCheckboxEvents();
      self.enableInputsEvents();
      self.disableOrEnableFilters();
      await self.requestMediaSource();

      self.link('apos-import', async () => {
        try {
          if (!self.choices.length) {
            return;
          };

          apos.notify('Download started.', { dismiss: true });
          apos.ui.globalBusy(true);
          const files = self.choices.map(choice => self.results
            .find(result => result.mediaSourceId === choice));

          const imagesIds = [];

          for (const file of files) {
            const formData = {
              file,
              connector: self.mediaSourceConnector.name
            };

            const imageId = await apos.utils
              .post(`${self.mediaSourceConnector.action}/download`, formData);

            imagesIds.push(imageId);
          }

          apos.emit('refreshImages', imagesIds);
          apos.notify('Download succeeded.', {
            type: 'success',
            dismiss: true
          });
        } catch ({ response }) {
          apos.notify(response || 'There has been an error. Please, retry later.', { type: 'error' });
        }

        apos.ui.globalBusy(false);
      });

      function triggerScript() {
        // empty DOM element the script will populate (defined in template "mediaSourcesBrowser.html")
        const [ domElement ] = self.$el.find('[data-script-element]');

        apos.emit(`${self.mediaSourceConnector.script.name}Loaded`, {
          domElement,
          mediaSourceConnector: self.mediaSourceConnector
        });
      };

      callback();
    };

    self.enableInputsEvents = () => {
      // Make search when clicking on enter
      self.$filters.keypress(({ originalEvent }) => {
        if (originalEvent.charCode === 13) {
          self.requestMediaSource();
        }
      });

      $(document).keydown(({ originalEvent }) => {
        // Left arrow
        if (originalEvent.keyCode === 37) {
          const isFirstPage = self.currentPage === 1;
          self.requestMediaSource(isFirstPage ? self.totalPages : self.currentPage - 1);
        } else if (originalEvent.keyCode === 39) {
          const isLastPage = self.currentPage === self.totalPages;
          self.requestMediaSource(isLastPage ? 1 : self.currentPage + 1);
        }
      });

      self.$el.on('change', 'select[data-media-sources-filter]', () => {
        self.requestMediaSource();
      });

      self.$el.on('input', 'input[data-media-sources-filter]', debounce(function() {
        const hasNoValue = !self.$searchInput.value.length;

        self.disableOrEnableFilters(hasNoValue, 'search');

        self.requestMediaSource();
      }, 500));

      function debounce(func, wait, immediate) {
        let timeout;
        return () => {
          const context = this;
          const args = arguments;

          const callNow = immediate && !timeout;
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
          callNow && func.apply(context, args);

        };

        function later (ctx, args) {
          timeout = null;
          !immediate && func.apply(ctx, args);
        };
      };
    };

    self.disableOrEnableFilters = (disable = true, dependency) => {
      const allFilters = [
        ...self.mediaSourceConnector.standardFilters || [],
        ...self.mediaSourceConnector.customFilters || []
      ];

      allFilters.forEach((filter) => {
        if (filter.dependsOn) {
          const $filter = self.$filters.find(`[name="${filter.name}"]`).first();

          if (!dependency) {
            $filter.prop('disabled', disable);
          }

          if (dependency && filter.dependsOn.includes('search')) {
            const inputType = $filter.prop('type');
            if (inputType === ('select-one') && disable) {
              $filter[0].selectedIndex = 0;
            }
            $filter.prop('disabled', disable);
          }
        }
      });
    };

    self.checkSelectAll = () => {
      const [ selectAll ] = self.$filters.find('input[type="checkbox"][name="select-all"]');

      $(selectAll).prop('checked', self.choices.length === (self.results.length - self.existingIds.length));
    };

    self.enableCheckboxEvents = () => {
      self.$el.on('change', 'input[type="checkbox"][name="select-all"]', ({ currentTarget }) => {
        const $pieces = self.$el.find('[data-piece]');

        $pieces.each((i, piece) => {
          const isImported = $(piece).data('imported');

          if (isImported === undefined) {
            const $checkbox = $(piece).find('input[type="checkbox"]');

            $checkbox.prop('checked', currentTarget.checked).trigger('change');
          }
        });

        self.toggleImportButton();
        self.checkSelectAll();
      });

      self.$el.on('change', '[data-piece] input[type="checkbox"]', ({ currentTarget }) => {
        const $box = $(currentTarget);
        const $currentPiece = $box.parent().parent();
        const id = $box.closest('[data-piece]').attr('data-media-source-id');

        $currentPiece.toggleClass('apos-focus', currentTarget.checked);
        self.addOrRemoveChoice(id, !currentTarget.checked);
      });

      // Add ability to select multiple checkboxes (Using Left Shift)
      let lastChecked;
      // Clicks on checkbox directly are not possible because as
      // visibility:hidden is set on it and clicks won't be detected.
      self.$el.on('click', '[data-piece]', function (e) {
        e.preventDefault();
        const [ checkbox ] = $(e.currentTarget).find('input[type="checkbox"]');
        const $checkbox = $(checkbox);

        $checkbox.prop('checked', !checkbox.checked);
        $checkbox.trigger('change');

        // Store a variable called lastchecked to point to the last checked checkbox.
        // If it is undefined it's the first checkbox that's selected.
        if (!lastChecked && checkbox.checked) {
          lastChecked = checkbox;
          self.toggleImportButton();
          return self.checkSelectAll();
        }

        // If shift key is pressed and the checkbox is not.
        if (e.shiftKey) {
          if (checkbox.checked) {
            const $checkboxesInScope = $checkbox.closest('[data-items]').find('input') || [];
            const startIndex = $checkboxesInScope.index(checkbox);
            const endIndex = $checkboxesInScope.index(lastChecked);

            $checkboxesInScope.slice(
              Math.min(startIndex, endIndex),
              Math.max(startIndex, endIndex) + 1
            ).each((i, el) => {
              if (!$(el).prop('checked')) {
                $(el).prop('checked', true);
                $(el).trigger('change');
              }
            });
          } else {
            const $pieces = self.$el.find('[data-piece]');
            const currentId = $(e.currentTarget).attr('data-media-source-id');

            $pieces.each((i, piece) => {
              const id = $(piece).attr('data-media-source-id');

              if (id !== currentId) {
                $(piece).find('input[type="checkbox"]')
                  .prop('checked', false)
                  .trigger('change');
              }
            });
          }
        }

        self.toggleImportButton();
        self.checkSelectAll();

        lastChecked = checkbox.checked ? checkbox : null;
      });
    };

    self.toggleImportButton = () => {
      const $importButton = self.$el.find('[data-apos-import]');

      if (self.choices.length) {
        $importButton.removeClass('apos-button--disabled');
      } else {
        $importButton.addClass('apos-button--disabled');
      }
    };

    self.addOrRemoveChoice = (id, remove = false) => {
      if (remove) {
        self.choices = self.choices.filter((choiceId) => choiceId !== id);
        return;
      }

      if (!self.choices.includes(id)) {
        self.choices.push(id);
      }
    };

    self.requestMediaSource = async (page = 1) => {
      try {
        const formData = {
          ...self.getFormData(self.$filters),
          page,
          connector: self.mediaSourceConnector.name
        };

        const {
          images: {
            results,
            total,
            totalPages
          },
          existingIds,
          filterChoices
        } = await apos.utils.post(`${self.mediaSourceConnector.action}/find`, formData);

        self.currentPage = page;
        self.totalPages = totalPages;
        self.results = results;
        self.existingIds = existingIds;

        self.injectResultsLabel(results.length, total, page);
        self.injectResultsList(results, existingIds);
        self.injectResultsPager({
          current: page,
          total: totalPages
        });

        self.updateFiltersChoices(filterChoices);

      } catch ({ response }) {
        const msg = response || 'There has been an error. Please, retry later.';

        apos.notify(msg, { type: 'error' });
      }
    };

    self.updateFiltersChoices = (choices) => {
      const $selectFilters = self.$filters.find('select.apos-field-input');

      $selectFilters.each((i, item) => {
        const $item = $(item);
        const itemChoices = choices[item.name];

        const { selectOptions, value } = itemChoices.reduce((acc, choice) => {
          const selectOptions = `${acc.selectOptions}<option value=${choice.value}>${choice.label}</option>`;

          // If previous choice already exist we keep it set
          return choice.value === $item.val()
            ? {
              value: choice.value,
              selectOptions
            }
            : {
              ...acc,
              selectOptions
            };
        }, {
          selectOptions: '',
          value: ''
        });

        $item.empty();
        $item.append(selectOptions);
        $item.val(value);
      });
    };

    self.afterShow = (callback) => {
      if (self.$searchInput) {
        self.$searchInput.focus();
      }
      return callback;
    };

    self.getFormData = () => {
      const filters = self.$filters.find('[data-media-sources-filter]');
      const values = {};

      filters.each(function() {
        if (this.value) {
          values[this.name] = this.value;
        }
      });

      return values;
    };

    self.injectResultsLabel = (numResults, total, page) => {
      const $resultsLabel = self.$el.find('[data-result-label]');
      const { perPage, totalResults } = self.mediaSourceConnector;
      const isLastPage = page !== 1 && (numResults < perPage);

      if (!numResults) {
        $resultsLabel.empty();
        $resultsLabel.append('No Results');

        return;
      }

      const end = isLastPage
        ? total
        : page * perPage;

      const start = end - (numResults - 1);

      const limitedResultsMsg = total > totalResults
        ? ` (Results have been limited around ${totalResults})`
        : '';

      $resultsLabel.empty();
      $resultsLabel.append(`Showing ${start} - ${end} of ${total}${limitedResultsMsg}`);
    };

    self.injectResultsList = (results, existingIds) => {
      const htmlToInject = results.reduce((acc, item) => {
        const alreadyImported = existingIds.includes(item.mediaSourceId);

        return `
          ${acc}
          ${self.getHtmlListItem(item, alreadyImported)}
        `;
      }, '');

      self.$items.empty();
      self.$items.append(htmlToInject);

      const items = self.$items.find('.apos-manage-grid-piece');

      items.each((index, item) => {
        const button = $(item).find('.apos-manage-grid-piece-controls button');

        $(button).on('click', (e) => {
          e.stopPropagation();
          const itemId = $(item).data('media-source-id');
          const isImported = $(item).data('imported');
          const data = self.results.find((item) => item.mediaSourceId === itemId);

          apos.create('media-sources-preview', {
            action: self.action,
            transition: 'slide',
            body: {
              item: data,
              provider: self.body.provider,
              isImported: isImported !== undefined
            }
          });
        });

      });
    };

    self.getHtmlListItem = (item, alreadyImported) => {
      const checkbox = `<label>
        <input type="checkbox" class="apos-field-input apos-field-input-checkbox" />
        <span class="apos-field-input-checkbox-indicator"></span>
      </label>`;

      return `<div class="apos-manage-grid-piece" data-piece data-media-source-id="${
        item.mediaSourceId}" ${alreadyImported ? 'data-imported' : ''}>
      <div class="apos-manage-grid-image">
        <img src="${item.thumbLink}" alt="image from Unsplash" />
        <div class="apos-image-screen"></div>
        <div class="apos-manage-grid-piece-controls">
          <button class="apos-button apos-button--minor">
            Info
            <i class="fa fa-caret-right"></i>
          </button>
        </div>
      </div>
      <div class="apos-manage-grid-piece-label">${item.title}</div>
      ${!alreadyImported ? checkbox : ''}
    </div>`;
    };

    self.injectResultsPager = ({
      current,
      total
    }) => {
      const $pager = self.$el.find('[data-media-sources-pager]');

      const htmlPager = self.getHtmlPager({
        current,
        total
      });

      $pager.empty();
      $pager.append(htmlPager);

      const pagerLinks = $pager.find('[data-apos-page]');

      pagerLinks.each((index, item) => {
        const page = $(item).data('apos-page');

        $(item).on('click', () => {
          self.requestMediaSource(page);
        });
      });
    };

    self.getHtmlPagerItem = ({
      num,
      isLast,
      isActive,
      isFirst
    }) => {
      return `<span class="apos-pager-number${
        isFirst ? ' apos-first' : ''}${
        isLast ? ' apos-last' : ''}${
        isActive ? ' apos-active' : ''}">${
        !isActive ? `<a data-apos-page=${num}>${num}</a>` : num}</span>`;
    };

    self.getHtmlPager = ({
      current,
      total
    }) => {
      if (!self.results.length) {
        return self.getHtmlPagerItem({
          num: 1,
          isActive: true
        });
      }

      const maxPages = 6;
      const pagerSize = (total < maxPages ? total : maxPages);

      const hasGaps = total > maxPages;

      // We create an array of numbers to iterate from and
      // we add two for the gap and the last page if more than 4 pages
      const pagerIterator = [ ...Array(pagerSize + (hasGaps ? 2 : 0)).keys() ];

      const pagerToInject = pagerIterator.reduce((acc, index) => {
        const pagerNumber = index + 1;

        const gapItem = hasGaps ? '<span class="apos-pager-gap">...</span>' : '';

        // Depending on where we are in the pages, render the right
        // page number at the right place
        const numberToRender = (lastPages = false) => {
          switch (pagerNumber) {
            case 2:
              return lastPages ? total - 4 : current - 2;
            case 3:
              return lastPages ? total - 3 : current - 1;
            case 4:
              return lastPages ? total - 2 : current;
            case 5:
              return lastPages ? total - 1 : current + 1;
            case 6:
              return lastPages ? total : current + 2;
          }
        };

        if (hasGaps) {
          // If we are in intermediate page
          if (current > 4 && current <= total - 4) {
            const num = numberToRender();

            if (num) {
              return `${acc}${pagerNumber === 2 ? gapItem : ''}${self.getHtmlPagerItem({
              num,
              isActive: num === current
            })}`;
            }
          }

          // If the current page is one of the 4 last ones
          if (current > total - 4) {
            const num = numberToRender(true);

            if (num) {
              return `${acc}${pagerNumber === 2 ? gapItem : ''}${self.getHtmlPagerItem({
              num,
              isActive: num === current
            })}`;
            }

            // We dont render the 2 last pagers
            if (pagerNumber > 6) {
              return acc;
            }
          } else {
          // If we aren't in last pages, we want a gap and the last page
            if (pagerNumber === pagerSize + 1) {
              return `${acc}${gapItem}`;
            }
            if (pagerNumber === pagerSize + 2) {
              return `${acc}${self.getHtmlPagerItem({
              num: total,
              isLast: true
            })}`;
            }
          }
        }

        const item = self.getHtmlPagerItem({
          num: pagerNumber,
          isActive: pagerNumber === current,
          isFirst: pagerNumber === 1
        });

        return `${acc}${item}`;
      }, '');

      return pagerToInject;
    };
  }
});
