<?php
namespace OCA\Pdfdraw\Migration;

use OCP\DB\ISchemaWrapper;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version1000Date20211122150107 extends SimpleMigrationStep {

	/**
	 * @param IOutput $output
	 * @param \Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
	 * @param array $options
	 * @return null|ISchemaWrapper
	 * @since 13.0.0
	 */
	public function changeSchema(IOutput $output, \Closure $schemaClosure, array $options) {
		/** @var ISchemaWrapper $schema */
		$schema = $schemaClosure();

		if (!$schema->hasTable('pdfdraw_items')) {
			$table = $schema->createTable('pdfdraw_items');
			$table->addColumn('file_id', 'string', [
				'notnull' => true,
			]);
			$table->addColumn('page', 'integer', [
				'notnull' => true,
			]);
			$table->addColumn('name', 'string', [
				'notnull' => true,
			]);
			$table->addColumn('data', 'text', [
				'notnull' => true,
			]);
			$table->setPrimaryKey(['file_id', 'name']);
			$table->addIndex(['file_id'], 'fileid_index');
		}
		return $schema;
	}

}
