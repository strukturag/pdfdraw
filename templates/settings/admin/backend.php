<?php
/** @var array $_ */
/** @var \OCP\IL10N $l */
script('pdfdraw', ['admin/backend']);
style('pdfdraw', ['backend']);
?>

<div class="pdfdraw section backend" data-backend="<?php p($_['backend']) ?>">
	<h3><?php p($l->t('PDF Annotations')) ?></h3>
	<div class="backend-server">
		<h4><?php p($l->t('Backend server')) ?></h4>
		<input type="text" id="backend_server"
				 name="backend_server" placeholder="<?php p($l->t('https://server.domain.invalid/path/')) ?>" aria-label="<?php p($l->t('Backend server')) ?>"/>
		<span class="icon icon-checkmark-color hidden" title="<?php p($l->t('Saved')) ?>"></span>
	</div>
	<div class="shared-secret">
		<h4><?php p($l->t('Shared secret')) ?></h4>
		<input type="text" id="shared_secret"
				 name="shared_secret" placeholder="<?php p($l->t('Shared secret')) ?>" aria-label="<?php p($l->t('Shared secret')) ?>"/>
		<span class="icon icon-checkmark-color hidden" title="<?php p($l->t('Saved')) ?>"></span>
	</div>
</div>
