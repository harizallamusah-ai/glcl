/* Worker registration: live declaration, uppercase formatting, validation, PDF generation/download. */

(function () {
  'use strict';

  function initRegistrationForm() {
    var form = document.getElementById('registration-form');
    if (!form) return;

    var generateBtn = document.getElementById('generate-btn');
    var downloadBtn = document.getElementById('download-btn');
    var statusBox = document.getElementById('form-status');
    var previewBox = document.getElementById('pdf-preview');
    var frame = document.getElementById('pdf-frame');
    var filenameLabel = document.getElementById('pdf-filename-label');
    var downloadLink = document.getElementById('download-link');
    var declarationName = document.getElementById('declaration-name');

    var FIELD_IDS = [
      'surname',
      'firstName',
      'otherNames',
      'dateOfBirth',
      'gender',
      'nationality',
      'homeTown',
      'profession',
      'phoneNumber',
      'staffId',
      'ssnitNumber',
      'ghanaCardNo',
      'residentialAddress',
      'spouseName',
      'fathersName',
      'mothersName',
      'nextOfKin',
      'nextOfKinContact',
      'emergencyContactPerson',
      'emergencyContactPhone'
    ];

    var REQUIRED_IDS = [
      'surname',
      'firstName',
      'dateOfBirth',
      'gender',
      'nationality',
      'phoneNumber',
      'residentialAddress',
      'nextOfKin',
      'nextOfKinContact',
      'emergencyContactPerson',
      'emergencyContactPhone'
    ];

    var attempted = false;
    var generating = false;
    var objectUrl = null;
    var currentFilename = '';

    /* ----- Auto-uppercase for typed text ----- */
    form.querySelectorAll('input[type="text"], input[type="tel"]').forEach(function (input) {
      if (input.id === 'ghanaCardNo') return; // Handled specifically with auto-hyphen formatting
      input.addEventListener('input', function () {
        var start = input.selectionStart;
        input.value = input.value.toUpperCase();
        if (start !== null && input.type !== 'date') {
          try {
            input.setSelectionRange(start, start);
          } catch (err) {
            /* selection not supported */
          }
        }
      });
    });

    /* ----- Ghana Card number: GHA-XXXXXXXXX-X  (GHA, hyphen, 9 digits, hyphen, 1 digit) -----
       Rules:
       - after "GHA" only digits and hyphens are accepted (no letters);
       - the letters G, H, A, the digits and the hyphens can all be deleted or re-typed freely;
       - while typing/pasting the hyphens are placed automatically; while deleting nothing is forced back in. */
    var GHANA_CARD_RE = /^GHA-\d{9}-\d$/;
    var ghanaCardInput = document.getElementById('ghanaCardNo');
    if (ghanaCardInput) {
      ghanaCardInput.setAttribute('placeholder', 'GHA-123456789-0');
      ghanaCardInput.removeAttribute('maxlength');   /* length is capped in the formatter, so pasted text with spaces is not cut short */
      ghanaCardInput.setAttribute('autocomplete', 'off');
      ghanaCardInput.setAttribute('spellcheck', 'false');

      var parseGhana = function (raw) {
        var t = String(raw).toUpperCase().replace(/[^A-Z0-9-]/g, '');
        var letters = t.match(/^[A-Z]*/)[0];
        return { letters: letters, rest: t.slice(letters.length).replace(/[^0-9-]/g, '') };
      };

      /* Deleting: keep what is left, only enforce the character rules (G,H,A in order, then digits/hyphens). */
      var ghanaLenient = function (raw) {
        var p = parseGhana(raw), out = '', pos = 0;
        p.letters.split('').forEach(function (ch) {
          var idx = 'GHA'.indexOf(ch, pos);
          if (idx !== -1) { out += ch; pos = idx + 1; }
        });
        var digits = 0, hyphens = 0, prev = '';
        p.rest.split('').forEach(function (ch) {
          if (ch === '-') {
            if (hyphens < 2 && prev !== '-') { out += ch; hyphens++; prev = ch; }
          } else if (digits < 10) { out += ch; digits++; prev = ch; }
        });
        return out.slice(0, 15);
      };

      /* Typing / pasting: rebuild the exact layout GHA-XXXXXXXXX-X. */
      var ghanaCanonical = function (raw) {
        var p = parseGhana(raw);
        var digits = p.rest.replace(/\D/g, '').slice(0, 10);
        var letters = '';
        while (letters.length < 3 && p.letters.charAt(letters.length) === 'GHA'.charAt(letters.length)) {
          letters += 'GHA'.charAt(letters.length);
        }
        var prefix = digits.length > 0 ? 'GHA' : letters;   /* typing digits completes the GHA prefix */
        var out = prefix;
        if (prefix === 'GHA') out += '-';
        out += digits.slice(0, 9);
        if (digits.length >= 9) out += '-';
        if (digits.length === 10) out += digits.charAt(9);
        return out;
      };

      var lastGhana = '';
      ghanaCardInput.addEventListener('input', function (e) {
        var el = ghanaCardInput;
        var type = e && e.inputType;
        var isDeleting = type ? (type.indexOf('delete') === 0 || type.indexOf('history') === 0)
                              : el.value.length < lastGhana.length;
        var caret = el.selectionStart;
        var rawLen = el.value.length;
        var before = caret === null ? rawLen : caret;
        var atEnd = before >= rawLen;
        var sigBefore = el.value.slice(0, before).replace(/[^A-Za-z0-9]/g, '').length;

        var formatted = isDeleting ? ghanaLenient(el.value) : ghanaCanonical(el.value);
        if (formatted !== el.value) {
          el.value = formatted;
          var pos = 0, count = 0;
          while (pos < formatted.length && count < sigBefore) {
            if (/[A-Z0-9]/.test(formatted.charAt(pos))) count++;
            pos++;
          }
          if (!isDeleting && formatted.charAt(pos) === '-') pos++;
          if (atEnd) pos = formatted.length;   /* typing at the end: the caret always stays at the end */
          try { el.setSelectionRange(pos, pos); } catch (err) { /* not supported */ }
        }
        lastGhana = el.value;
      });

      /* On leaving the field: tidy a complete number that was typed without hyphens, then check it. */
      ghanaCardInput.addEventListener('blur', function () {
        var v = ghanaCardInput.value;
        if (!v) return;
        if (/^GHA/.test(v) && v.replace(/\D/g, '').length === 10) ghanaCardInput.value = ghanaCanonical(v);
        lastGhana = ghanaCardInput.value;
        validateField(ghanaCardInput);
      });
    }

    var setFieldError = function (input, message) {
      var errorEl = document.getElementById(input.id + '-error');
      if (message) {
        input.setAttribute('aria-invalid', 'true');
        if (errorEl) errorEl.textContent = message;
        return false;
      }
      input.removeAttribute('aria-invalid');
      if (errorEl) errorEl.textContent = '';
      return true;
    };

    var validateField = function (input) {
      var value = input.value.trim();
      if (REQUIRED_IDS.indexOf(input.id) !== -1 && !value) {
        var label = document.querySelector('label[for="' + input.id + '"]');
        var name = label ? label.textContent.replace('*', '').trim().toLowerCase() : 'this field';
        return setFieldError(input, 'Please enter ' + name + '.');
      }
      if (input.id === 'phoneNumber' || input.id === 'nextOfKinContact' || input.id === 'emergencyContactPhone') {
        if (!value) return setFieldError(input, '');
        if (!/^[+\d][\d\s()\-.]{5,}$/.test(value)) {
          return setFieldError(input, 'Use digits, spaces or + ( ) - only.');
        }
        var digits = value.replace(/\D/g, '');
        if (digits.length < 7 || digits.length > 15) {
          return setFieldError(input, 'That phone number looks the wrong length.');
        }
      }
      if (input.id === 'ghanaCardNo' && value && !GHANA_CARD_RE.test(value)) {
        return setFieldError(input, 'Enter the Ghana Card number like GHA-123456789-0 (GHA, 9 digits, then 1 digit).');
      }
      return setFieldError(input, '');
    };

    var validateAll = function () {
      var ok = true;
      FIELD_IDS.forEach(function (id) {
        var input = document.getElementById(id);
        if (input && !validateField(input)) ok = false;
      });
      return ok;
    };

    /* ----- Live declaration preview ----- */
    var fullNameOf = function () {
      var parts = ['surname', 'firstName', 'otherNames']
        .map(function (id) {
          var el = document.getElementById(id);
          return el ? el.value.trim() : '';
        })
        .filter(Boolean);
      return parts.join(' ').toUpperCase();
    };

    var updateDeclaration = function () {
      if (!declarationName) return;
      var name = fullNameOf();
      declarationName.textContent = name || '……………………………';
    };

    /* ----- Stale preview invalidation ----- */
    var clearPreview = function () {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      if (frame) frame.removeAttribute('src');
      if (previewBox) previewBox.hidden = true;
      if (downloadBtn) downloadBtn.hidden = true;
      if (filenameLabel) filenameLabel.textContent = '';
      currentFilename = '';
    };

    form.addEventListener('input', function (event) {
      updateDeclaration();
      if (attempted && event.target && event.target.id) validateField(event.target);
      if (previewBox && !previewBox.hidden) {
        clearPreview();
        if (statusBox) {
          statusBox.innerHTML =
            '<div class="alert alert--info"><div><p>The form changed — generate the PDF again to refresh the preview.</p></div></div>';
        }
      }
    });

    form.addEventListener('reset', function () {
      window.setTimeout(function () {
        FIELD_IDS.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) setFieldError(el, '');
        });
        attempted = false;
        clearPreview();
        updateDeclaration();
        if (statusBox) statusBox.innerHTML = '';
        if (generateBtn) generateBtn.disabled = false;
      }, 0);
    });

    /* ----- Generate handler (always prevents default submit) ----- */
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (generating) return false;

      attempted = true;
      if (statusBox) statusBox.innerHTML = '';

      if (!validateAll()) {
        if (statusBox) {
          statusBox.innerHTML =
            '<div class="alert alert--error"><div><h3>Check the highlighted fields</h3><p>Some required details are missing or need fixing before the PDF can be generated.</p></div></div>';
        }
        var firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
        return false;
      }

      var values = {};
      FIELD_IDS.forEach(function (id) {
        var el = document.getElementById(id);
        values[id] = el ? el.value.trim() : '';
      });

      /* Date of birth: format DD/MM/YYYY for the printed form */
      if (values.dateOfBirth) {
        var parts = values.dateOfBirth.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          values.dateOfBirth = parts[2] + '/' + parts[1] + '/' + parts[0];
        }
      }

      generating = true;
      if (generateBtn) {
        generateBtn.disabled = true;
        var originalLabel = generateBtn.textContent;
        generateBtn.innerHTML = '<span class="btn__spinner" aria-hidden="true"></span> Generating…';
      }

      var buildFn = window.buildRegistrationPdf;
      var filenameFn = window.registrationPdfFilename;

      if (typeof buildFn !== 'function') {
        if (statusBox) {
          statusBox.innerHTML =
            '<div class="alert alert--error"><div><h3>PDF library loading</h3><p>Please wait a moment and try clicking Generate PDF again.</p></div></div>';
        }
        generating = false;
        if (generateBtn) {
          generateBtn.disabled = false;
          generateBtn.textContent = originalLabel || 'Generate PDF';
        }
        return false;
      }

      buildFn(values)
        .then(function (doc) {
          var blob = doc.output('blob');
          clearPreview();
          objectUrl = URL.createObjectURL(blob);
          currentFilename = filenameFn ? filenameFn(values) : 'STAFF REGISTRATION FORM.pdf';

          if (frame) frame.src = objectUrl + '#toolbar=1&view=FitH';
          if (previewBox) previewBox.hidden = false;
          if (filenameLabel) filenameLabel.textContent = currentFilename;
          if (downloadLink) {
            downloadLink.href = objectUrl;
            downloadLink.setAttribute('download', currentFilename);
          }
          if (downloadBtn) {
            downloadBtn.hidden = false;
            downloadBtn.onclick = function () {
              var anchor = document.createElement('a');
              anchor.href = objectUrl;
              anchor.download = currentFilename;
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            };
          }

          if (statusBox) {
            statusBox.innerHTML =
              '<div class="alert alert--success"><div><h3>PDF ready</h3><p>Check the preview below, then download the file and <strong>print TWO copies</strong> — one for your personal records and one to submit at GLCL’s main office on Meridian Road, Tema. Sign and date both copies by hand.</p></div></div>';
          }
          if (previewBox) {
            previewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        })
        .catch(function (error) {
          console.error('PDF generation error:', error);
          if (statusBox) {
            statusBox.innerHTML =
              '<div class="alert alert--error"><div><h3>Could not generate the PDF</h3><p>The form generator encountered an error (' + (error.message || 'unknown') + '). Please verify your details and try again.</p></div></div>';
          }
        })
        .finally(function () {
          generating = false;
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = originalLabel || 'Generate PDF';
          }
        });

      return false;
    });

    updateDeclaration();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegistrationForm);
  } else {
    initRegistrationForm();
  }
})();
