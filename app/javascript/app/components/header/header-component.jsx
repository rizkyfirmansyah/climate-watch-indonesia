import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import cx from 'classnames';
import Nav from 'components/nav';
import NavNestedMenu from 'components/nav-nested-menu';
import { NavLink } from 'redux-first-router-link';
import { LANGUAGES_AVAILABLE } from 'constants/languages';
import navStyles from 'components/nav/nav-styles';
import styles from './header-styles.scss';

class Header extends PureComponent {
  handleLanguageChange = language => {
    const { onChangeLanguage } = this.props;
    onChangeLanguage(language.value);
  };

  render() {
    const { routes, className, locale } = this.props;
    return (
      <div className={styles.headerContainer} id="header">
        <div className={cx(styles.header, className)}>
          <NavLink
            exact
            className={cx(styles.logo)}
            to="/"
            onTouchStart={undefined}
            onMouseDown={undefined}
          >
            <div className={styles.country}>
              INDONESIA
            </div>
            <div className={styles.climateExplorer}>
              <span className={styles.bold}>CLIMATE</span>
              WATCH
            </div>
          </NavLink>
          <div className={styles.tabs}>
            <div className={styles.leftTabs}>
              <div className={styles.tabsContainer}>
                <Nav
                  theme={{
                    nav: cx(styles.stickyNavElement, styles.stickyTabs),
                    link: styles.stickyLink
                  }}
                  routes={routes.filter(r => !r.navNestedMenu)}
                />
              </div>
              {routes
                .filter(r => r.navNestedMenu)
                .map(route => (
                  <NavNestedMenu
                    key={route.label}
                    title={route.label}
                    allowRender
                    className={cx(navStyles.link)}
                    Child={route.Child}
                  />
                ))}
            </div>
            <div className={styles.rightTabs}>
              <NavNestedMenu
                key="language"
                options={LANGUAGES_AVAILABLE}
                title={LANGUAGES_AVAILABLE.find(lang => lang.value === locale)}
                buttonClassName={styles.link}
                onValueChange={this.handleLanguageChange}
                positionRight
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

Header.propTypes = {
  className: PropTypes.string,
  routes: PropTypes.array.isRequired,
  onChangeLanguage: PropTypes.func.isRequired,
  locale: PropTypes.string.isRequired
};

Header.defaultProps = { className: '' };

export default Header;
