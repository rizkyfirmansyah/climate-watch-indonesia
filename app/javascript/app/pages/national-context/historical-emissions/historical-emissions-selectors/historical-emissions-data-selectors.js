import { createStructuredSelector, createSelector } from 'reselect';
import isArray from 'lodash/isArray';
import castArray from 'lodash/castArray';
import isEmpty from 'lodash/isEmpty';
import uniqBy from 'lodash/uniqBy';
import {
  ALL_SELECTED,
  METRIC_OPTIONS,
  METRIC,
  API_TARGET_DATA_SCALE,
  SECTOR_TOTAL
} from 'constants/constants';

import {
  DEFAULT_AXES_CONFIG,
  getThemeConfig,
  getYColumnValue,
  getTooltipConfig
} from 'utils/graphs';

import { getTranslate } from 'selectors/translation-selectors';
import {
  getEmissionsData,
  getTargetEmissionsData,
  getMetadata
} from './historical-emissions-get-selectors';
import {
  getSelectedOptions,
  getFilterOptions,
  getModelSelected,
  getMetricSelected
} from './historical-emissions-filter-selectors';

const { COUNTRY_ISO } = process.env;
const FRONTEND_FILTERED_FIELDS = [ 'provinces', 'sector' ];

const getUnit = createSelector([ getMetadata, getMetricSelected ], (
  meta,
  metric
) =>
  {
    if (!meta || !metric) return null;
    const { metric: metrics } = meta;
    const metricObject = metrics &&
      metrics.find(m => METRIC[metric] === m.code);
    return metricObject && metricObject.unit;
  });

export const getScale = createSelector([ getUnit ], unit => {
  if (!unit) return null;
  if (unit.startsWith('kt')) return 1000;
  return 1;
});

const getCorrectedUnit = createSelector([ getUnit, getScale ], (unit, scale) =>
  {
    if (!unit || !scale) return null;
    return unit.replace('kt', 't');
  });

const getLegendDataOptions = createSelector(
  [ getModelSelected, getFilterOptions ],
  (modelSelected, options) => {
    if (!options || !modelSelected || !options[modelSelected]) return null;
    return options[modelSelected];
  }
);

const getLegendDataSelected = createSelector(
  [ getModelSelected, getSelectedOptions, getFilterOptions ],
  (modelSelected, selectedOptions, options) => {
    if (
      !selectedOptions ||
        !modelSelected ||
        !selectedOptions[modelSelected] ||
        !options
    )
      return null;

    const dataSelected = selectedOptions[modelSelected];
    if (!isArray(dataSelected)) {
      if (dataSelected.value === ALL_SELECTED) return options[modelSelected];
    }
    return isArray(dataSelected) ? dataSelected : [ dataSelected ];
  }
);

const getYColumnOptions = createSelector(
  [ getLegendDataSelected, getMetricSelected, getModelSelected ],
  (legendDataSelected, metricSelected, modelSelected) => {
    if (!legendDataSelected) return null;
    const removeTotalSector = d =>
      modelSelected !== 'sector' ||
        metricSelected !== 'absolute' ||
        modelSelected === 'sector' && d.code !== SECTOR_TOTAL;
    const getYOption = columns =>
      columns &&
        columns
          .map(d => ({
            label: d && d.label,
            value: d && getYColumnValue(`${modelSelected}${d.value}`),
            code: d && (d.code || d.label)
          }))
          .filter(removeTotalSector);
    return uniqBy(getYOption(legendDataSelected), 'value');
  }
);

const getDFilterValue = (d, modelSelected) =>
  modelSelected === 'provinces' ? d.iso_code3 : d[modelSelected];

const isOptionSelected = (selectedOptions, valueOrCode) =>
  castArray(selectedOptions).some(
    o => o.value === valueOrCode || o.code === valueOrCode
  );
const filterBySelectedOptions = (
  emissionsData,
  metricSelected,
  modelSelected,
  selectedOptions
) =>
  {
    const fieldPassesFilter = (selectedFilterOption, fieldValue) =>
      isOptionSelected(selectedFilterOption, ALL_SELECTED) ||
        isOptionSelected(selectedFilterOption, fieldValue);
    const absoluteMetric = METRIC.absolute;

    return emissionsData
      .filter(d => d.metric === METRIC[metricSelected])
      .filter(
        d =>
          d.metric === absoluteMetric && d.sector !== SECTOR_TOTAL ||
            d.metric !== absoluteMetric
      )
      .filter(
        d =>
          FRONTEND_FILTERED_FIELDS.every(
            field =>
              fieldPassesFilter(
                selectedOptions[field],
                getDFilterValue(d, field)
              )
          )
      );
  };

const parseChartData = createSelector(
  [
    getEmissionsData,
    getMetricSelected,
    getModelSelected,
    getYColumnOptions,
    getSelectedOptions,
    getCorrectedUnit,
    getScale
  ],
  (
    emissionsData,
    metricSelected,
    modelSelected,
    yColumnOptions,
    selectedOptions,
    unit,
    scale
  ) =>
    {
      if (
        !emissionsData ||
          isEmpty(emissionsData) ||
          !metricSelected ||
          !yColumnOptions
      )
        return null;

      const yearValues = emissionsData[0].emissions.map(d => d.year);

      const filteredData = filterBySelectedOptions(
        emissionsData,
        metricSelected,
        modelSelected,
        selectedOptions
      );

      const dataParsed = [];
      yearValues.forEach(x => {
        const yItems = {};
        filteredData.forEach(d => {
          const columnObject = yColumnOptions.find(
            c => c.code === getDFilterValue(d, modelSelected)
          );
          const yKey = columnObject && columnObject.value;

          if (yKey) {
            const yData = d.emissions.find(e => e.year === x);
            if (yData && yData.value) {
              yItems[yKey] = (yItems[yKey] || 0) + yData.value * scale;
            }
          }
        });
        const item = { x, ...yItems };
        if (!isEmpty({ ...yItems })) dataParsed.push(item);
      });
      return dataParsed;
    }
);

let colorCache = {};

const parseTargetEmissionsData = createSelector(
  [
    getTargetEmissionsData,
    getSelectedOptions,
    getModelSelected,
    getMetricSelected
  ],
  (targetEmissionsData, selectedOptions, modelSelected, metricSelected) => {
    if (isEmpty(targetEmissionsData)) return null;
    if (metricSelected !== METRIC_OPTIONS.ABSOLUTE_VALUE) return null;
    if (!selectedOptions) return null;
    if (!isOptionSelected(selectedOptions.provinces, COUNTRY_ISO)) return null;
    if (
      isOptionSelected(selectedOptions.chartType, 'line') &&
        modelSelected === 'sector'
    )
      return null;

    const countryData = targetEmissionsData.filter(
      d => d.location === COUNTRY_ISO
    );
    const parsedTargetEmissions = [];
    countryData.forEach(d => {
      if (d.sector === 'TOTAL') {
        parsedTargetEmissions.push({
          x: d.year,
          y: d.value * API_TARGET_DATA_SCALE,
          label: d.label
        });
      }
    });
    return parsedTargetEmissions;
  }
);

const getProjectedChartConfig = createSelector(
  [ parseTargetEmissionsData, getTranslate ],
  (targetEmissionsData, t) => {
    if (isEmpty(targetEmissionsData)) return {};

    const targetLabels = t(
      'pages.national-context.historical-emissions.target-labels',
      { default: {} }
    );

    return {
      projectedColumns: [
        { label: targetLabels.bau, color: '#113750' },
        { label: targetLabels.quantified, color: '#ffc735' },
        { label: targetLabels['not-quantifiable'], color: '#b1b1c1' }
      ],
      projectedLabel: {}
    };
  }
);

export const getChartConfig = createSelector(
  [
    getEmissionsData,
    getMetricSelected,
    getProjectedChartConfig,
    getCorrectedUnit,
    getYColumnOptions,
    getTranslate
  ],
  (data, metricSelected, projectedConfig, unit, yColumnOptions) => {
    if (!data || isEmpty(data) || !metricSelected) return null;
    const tooltip = getTooltipConfig(yColumnOptions);
    const theme = getThemeConfig(yColumnOptions);
    colorCache = { ...theme, ...colorCache };
    const axes = {
      ...DEFAULT_AXES_CONFIG,
      yLeft: { ...DEFAULT_AXES_CONFIG.yLeft, unit }
    };

    const config = {
      axes,
      theme: colorCache,
      tooltip,
      animation: false,
      columns: { x: [ { label: 'year', value: 'x' } ], y: yColumnOptions }
    };

    return { ...config, ...projectedConfig };
  }
);

const getChartLoading = ({ metadata = {}, GHGEmissions = {} }) =>
  metadata && metadata.ghg.loading || GHGEmissions && GHGEmissions.loading;

const getDataLoading = createSelector(
  [ getChartLoading, parseChartData ],
  (loading, data) => loading || !data || false
);

export const getChartData = createStructuredSelector({
  data: parseChartData,
  projectedData: parseTargetEmissionsData,
  config: getChartConfig,
  loading: getDataLoading,
  dataOptions: getLegendDataOptions,
  dataSelected: getLegendDataSelected
});
