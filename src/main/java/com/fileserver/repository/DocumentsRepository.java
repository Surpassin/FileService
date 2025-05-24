package com.fileserver.repository;

import com.fileserver.constant.ModuleType;
import com.fileserver.entity.Documents;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DocumentsRepository extends JpaRepository<Documents, Long> {
    List<Documents> findByModuleAndReferenceId(ModuleType module, Long referenceId);
}
