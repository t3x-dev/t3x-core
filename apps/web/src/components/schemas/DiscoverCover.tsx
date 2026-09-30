import { cx, ReferenceIcon } from './DiscoverReference';
import styles from './ExploreDiscoverySurface.module.css';

/** Decorative editorial artwork; the depicted controls are not application state. */
export function DiscoverCover({ kind }: { kind: 'release' | 'circuit' | 'agent' }) {
  return (
    <div className={cx(`cover cover-${kind}`)}>
      <img
        className={styles.coverImage}
        src={`/schema-covers/${kind}-editorial.jpg`}
        alt={kind === 'circuit' ? 'Green circuit boards in a close-up hardware photograph' : ''}
        width={1200}
        height={440}
        decoding="async"
      />
      {kind === 'release' ? (
        <div
          className={styles.releaseArtwork}
          role="img"
          aria-label="Release pipeline illustration: Build, Test, Staging, Production"
        >
          {['Build', 'Test', 'Staging', 'Production'].map((stage, index) => (
            <div className={styles.releaseStage} key={stage}>
              <span className={index === 3 ? styles.productionDot : styles.stageDot} />
              <span>{stage}</span>
            </div>
          ))}
        </div>
      ) : null}
      {kind === 'agent' ? (
        <div
          className={styles.policyArtwork}
          role="img"
          aria-label="Agent rule set illustration: allow reading, block changes, require logging"
        >
          <div className={styles.policyTitle}>Agent rule set</div>
          {[
            {
              label: 'Allow',
              text: 'Read device status',
              icon: 'box',
              tone: 'allow',
              enabled: true,
            },
            {
              label: 'Block',
              text: 'Modify system settings',
              icon: 'box',
              tone: 'block',
              enabled: false,
            },
            {
              label: 'Require',
              text: 'Log all actions',
              icon: 'shield',
              tone: 'require',
              enabled: true,
            },
          ].map((rule) => (
            <div className={styles.policyRow} key={rule.label}>
              <ReferenceIcon name={rule.icon} size={14} className={cx(rule.tone)} />
              <span className={cx(rule.tone)}>{rule.label}</span>
              <span>{rule.text}</span>
              <span className={cx(`policyToggle${rule.enabled ? ' enabled' : ''}`)} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
